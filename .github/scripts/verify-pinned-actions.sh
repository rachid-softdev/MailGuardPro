#!/usr/bin/env bash
# ============================================================================
# verify-pinned-actions.sh
# ============================================================================
# Verifies that every `uses:` reference in GitHub Actions workflow files
# is pinned to a full 40-character commit SHA (not a version tag like @v3).
#
# Usage: bash .github/scripts/verify-pinned-actions.sh
#   Exit 0 — all actions are SHA-pinned
#   Exit 1 — one or more actions use version tags instead of SHAs
#
# This script ignores Docker `image:` lines (they are not GitHub Actions).
# ============================================================================

set -o pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WORKFLOW_DIR=".github/workflows"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"

# Colors (use tput if available, otherwise plain)
if command -v tput >/dev/null 2>&1; then
  RED="$(tput setaf 1)"
  GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"
  BOLD="$(tput bold)"
  RESET="$(tput sgr0)"
else
  RED=""
  GREEN=""
  YELLOW=""
  BOLD=""
  RESET=""
fi

# ---------------------------------------------------------------------------
# Reference table of expected SHA-pinned actions in this repository
# This is a living document — update when adding/updating actions.
# Format: owner/repo@<full_40_character_SHA>  # vX.Y.Z
# ---------------------------------------------------------------------------
print_reference_table() {
  cat <<'REFTABLE'

  ┌──────────────────────────────────────────────────────────────────────────┐
  │        Currently SHA-pinned Actions (owner/repo@SHA # version)          │
  ├──────────────────────────────────────────────────────────────────────────┤
  │ actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2     │
  │ pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093  # v6.0.8    │
  │ actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6.4.0   │
  │ codecov/codecov-action@57e3a136b779b570ffcdbf80b3bdc90e7fab3de2  # v6.0.0│
  │ actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02  # v4   │
  │ appleboy/ssh-action@55dabf81b49d4120609345970c91507e2d734799  # v1.0.0   │
  │ slackapi/slack-github-action@485a9d42d3a73031f12ec201c457e2162c45d02d # v2.0.0│
  └──────────────────────────────────────────────────────────────────────────┘

REFTABLE
}

# ---------------------------------------------------------------------------
# Helper: check if a string is a valid 40-character hex SHA
# ---------------------------------------------------------------------------
is_full_sha() {
  local ref="$1"
  # A full SHA is exactly 40 lowercase hex characters
  if echo "$ref" | grep -qE '^[0-9a-f]{40}$'; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Main verification logic
# ---------------------------------------------------------------------------
main() {
  local workflow_dir="$REPO_ROOT/$WORKFLOW_DIR"
  local exit_code=0
  local total_uses=0
  local pinned_count=0
  local unpinned_count=0

  # Arrays to track results (using bash 3+ compatible approach)
  local pinned_actions=""
  local unpinned_actions=""

  echo ""
  echo "=========================================="
  echo " GitHub Actions SHA-Pin Verification"
  echo "=========================================="
  echo ""

  # Check if workflow directory exists
  if [ ! -d "$workflow_dir" ]; then
    echo "${RED}ERROR: Workflow directory not found: $workflow_dir${RESET}"
    exit 1
  fi

      # Find all workflow files (recursive: handles subdirs like web/, extension/, etc.)
      local workflow_files=()
      while IFS= read -r -d '' file; do
        workflow_files+=("$file")
      done < <(find "$workflow_dir" -name '*.yml' -print0 2>/dev/null)

  if [ ${#workflow_files[@]} -eq 0 ]; then
    echo "${YELLOW}No workflow files found in $workflow_dir${RESET}"
    echo ""
    echo "${GREEN}No actions to verify — nothing to fail.${RESET}"
    exit 0
  fi

  echo "Found ${#workflow_files[@]} workflow file(s):"
  for wf in "${workflow_files[@]}"; do
    echo "  - $(basename "$wf")"
  done
  echo ""

  # Process each workflow file
  for wf in "${workflow_files[@]}"; do
    local wf_name
    wf_name="$(basename "$wf")"

    # Extract all uses: lines, ignoring Docker image: lines
    # Pattern: `uses: owner/repo@ref` optionally followed by ` # comment`
    while IFS= read -r line; do
      # Trim leading whitespace
      line_trimmed="$(echo "$line" | sed 's/^[[:space:]]*//')"

      # Skip non-uses lines
      if ! echo "$line_trimmed" | grep -qE '^uses:'; then
        continue
      fi

      total_uses=$((total_uses + 1))

      # Extract the full reference after `uses: `
      local action_ref
      action_ref="$(echo "$line_trimmed" | sed 's/^uses:[[:space:]]*//' | sed 's/[[:space:]]*#.*$//' | sed 's/[[:space:]]*$//')"

      # Debug: show what we found
      # echo "  [DEBUG] Found uses: $action_ref" >&2

      # Parse owner/repo and ref (everything after @)
      local owner_repo=""
      local ref=""

      case "$action_ref" in
        *@*)
          owner_repo="${action_ref%%@*}"
          ref="${action_ref#*@}"
          ;;
        *)
          # No @ at all — this is malformed
          owner_repo="$action_ref"
          ref=""
          ;;
      esac

      # Check if it's a Docker image reference (should not happen as we skip those,
      # but be defensive)
      if echo "$owner_repo" | grep -qE '^(docker://|[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+:[a-zA-Z])'; then
        continue
      fi

      # Determine if pinned
      if [ -n "$ref" ] && is_full_sha "$ref"; then
        pinned_count=$((pinned_count + 1))
        pinned_actions="$pinned_actions  ${GREEN}✓${RESET} $wf_name | $owner_repo@${ref:0:7}...${ref:35:5}${RESET}
"
      else
        unpinned_count=$((unpinned_count + 1))
        exit_code=1
        unpinned_actions="$unpinned_actions  ${RED}✗${RESET} $wf_name | $action_ref${RESET}
"
      fi
    done < <(grep -E '^\s+(-\s+)?uses:' "$wf" 2>/dev/null || true)
  done

  # -----------------------------------------------------------------------
  # Print summary table
  # -----------------------------------------------------------------------
  echo "=========================================="
  echo " Summary"
  echo "=========================================="
  echo ""
  echo " Total 'uses:' references found: $total_uses"
  echo ""

  if [ -n "$pinned_actions" ]; then
    echo " ${GREEN}Pinned (SHA) actions:${RESET}"
    echo "$pinned_actions"
  fi

  if [ -n "$unpinned_actions" ]; then
    echo " ${RED}Unpinned (tag) actions:${RESET}"
    echo "$unpinned_actions"
  fi

  echo "------------------------------------------"
  printf " ${GREEN}Pinned:${RESET}   %3d\n" "$pinned_count"
  if [ "$unpinned_count" -gt 0 ]; then
    printf " ${RED}Unpinned:${RESET} %3d\n" "$unpinned_count"
  else
    printf " Unpinned: %3d\n" "$unpinned_count"
  fi
  echo "------------------------------------------"
  echo ""

  # Reference table
  print_reference_table

  # -----------------------------------------------------------------------
  # Final verdict
  # -----------------------------------------------------------------------
  if [ "$exit_code" -eq 0 ]; then
    echo "${GREEN}${BOLD}✓ PASS: All GitHub Actions are SHA-pinned.${RESET}"
  else
    echo "${RED}${BOLD}✗ FAIL: $unpinned_count action(s) use version tags instead of SHAs.${RESET}"
    echo "${YELLOW}  Replace version tags (e.g., @v3) with full 40-char commit SHAs.${RESET}"
    echo "${YELLOW}  See https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions${RESET}"
  fi

  exit "$exit_code"
}

main "$@"
