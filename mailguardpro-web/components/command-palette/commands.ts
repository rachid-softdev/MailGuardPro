import {
  CheckCircle,
  Clock,
  KeyRound,
  LayoutDashboard,
  Plus,
  Settings,
  Upload,
  Webhook,
} from "lucide-react";
import type { Command } from "./types";

export type CommandDef = Omit<Command, "handler">;

export const navigationCommands: CommandDef[] = [
  {
    id: "nav-dashboard",
    label: "Dashboard",
    description: "Go to the dashboard",
    category: "navigation",
    icon: LayoutDashboard,
    keywords: ["home", "overview", "stats"],
  },
  {
    id: "nav-validate",
    label: "Validate",
    description: "Validate a single email",
    category: "navigation",
    icon: CheckCircle,
    keywords: ["check", "verify", "email"],
  },
  {
    id: "nav-bulk",
    label: "Bulk",
    description: "Upload a file for bulk validation",
    category: "navigation",
    icon: Upload,
    keywords: ["csv", "file", "batch", "mass"],
  },
  {
    id: "nav-history",
    label: "History",
    description: "View validation history",
    category: "navigation",
    icon: Clock,
    keywords: ["log", "past", "recent"],
  },
  {
    id: "nav-api-keys",
    label: "API Keys",
    description: "Manage your API keys",
    category: "navigation",
    icon: KeyRound,
    keywords: ["api", "token", "authentication"],
  },
  {
    id: "nav-webhooks",
    label: "Webhooks",
    description: "Configure webhook integrations",
    category: "navigation",
    icon: Webhook,
    keywords: ["hook", "callback", "integration"],
  },
  {
    id: "nav-settings",
    label: "Settings",
    description: "Configure your account settings",
    category: "navigation",
    icon: Settings,
    keywords: ["preferences", "account", "profile"],
  },
];

export const actionCommands: CommandDef[] = [
  {
    id: "action-create-api-key",
    label: "Create API Key",
    description: "Navigate to API Keys to create a new key",
    category: "actions",
    icon: Plus,
    keywords: ["generate", "api", "token", "new"],
    shortcut: "K",
  },
  {
    id: "action-new-validation",
    label: "New Validation",
    description: "Validate a single email address",
    category: "actions",
    icon: CheckCircle,
    keywords: ["check", "verify", "email", "single"],
    shortcut: "V",
  },
  {
    id: "action-bulk-upload",
    label: "Bulk Upload",
    description: "Upload a file for bulk email validation",
    category: "actions",
    icon: Upload,
    keywords: ["csv", "file", "batch", "mass", "import"],
    shortcut: "B",
  },
];

export const allCommandDefs: CommandDef[] = [...navigationCommands, ...actionCommands];
