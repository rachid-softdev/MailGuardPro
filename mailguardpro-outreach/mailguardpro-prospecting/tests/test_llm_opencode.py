"""Tests du client LLM : routage du provider et parsing de la sortie JSONL opencode."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import llm, utils


class _Proc:
    """Faux subprocess.CompletedProcess (stdout/stderr/returncode)."""

    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


def _text_event(text):
    return json.dumps({
        "type": "text",
        "timestamp": 1790585817537,
        "sessionID": "ses_test",
        "part": {
            "id": "prt_test_text-0",
            "type": "text",
            "text": text,
            "time": {"start": 1790585814571, "end": 1790585817537},
        },
    })


def _error_event(kind="provider.auth", message="Incorrect API key provided", status=401):
    return json.dumps({
        "type": "error",
        "timestamp": 1790585817537,
        "sessionID": "ses_test",
        "error": {"type": kind, "message": message, "status": status},
    })


_STEP_START = json.dumps({"type": "step_start", "sessionID": "ses_test",
                          "part": {"type": "step-start"}})


def _patch_run(monkeypatch, proc, calls=None):
    """Remplace subprocess.run : aucun vrai binaire opencode n'est invoqué."""
    def fake_run(cmd, **kwargs):
        if calls is not None:
            calls.append({"cmd": cmd, **kwargs})
        if isinstance(proc, Exception):
            raise proc
        return proc

    monkeypatch.setattr(llm.subprocess, "run", fake_run)


def _no_subprocess(monkeypatch):
    def fail(*a, **k):
        raise AssertionError("ne doit pas appeler le CLI opencode")

    monkeypatch.setattr(llm.subprocess, "run", fail)


class _Resp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


def test_opencode_parses_text_event(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    _patch_run(monkeypatch, _Proc(stdout="\n".join([_STEP_START, _text_event("bonjour")])))

    assert llm.chat("consigne", "contexte") == "bonjour"


def test_opencode_joins_multiple_text_events(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    stdout = "\n".join([_STEP_START, _text_event("part1"), _text_event("part2")])
    _patch_run(monkeypatch, _Proc(stdout=stdout))

    assert llm.chat("consigne", "contexte") == "part1\npart2"


def test_opencode_error_event_raises(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    _patch_run(monkeypatch, _Proc(stdout=_error_event(), returncode=1))

    with pytest.raises(llm.LLMError) as exc:
        llm._chat_opencode("consigne", "contexte")
    assert "Incorrect API key provided" in str(exc.value)


def test_opencode_nonzero_exit_without_output_raises(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    _patch_run(monkeypatch, _Proc(stdout="", stderr="boom", returncode=1))

    with pytest.raises(llm.LLMError):
        llm._chat_opencode("consigne", "contexte")


def test_opencode_garbage_output_raises(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    _patch_run(monkeypatch, _Proc(stdout="pas du JSON\nbruit\n", returncode=0))

    with pytest.raises(llm.LLMError):
        llm._chat_opencode("consigne", "contexte")


def test_opencode_command_uses_configured_bin_and_model(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    fake_bin = tmp_path / "opencode.exe"
    fake_bin.write_text("x")
    monkeypatch.setenv("OPENCODE_BIN", str(fake_bin))
    monkeypatch.setenv("OPENCODE_MODEL", "opencode/big-pickle")
    calls = []
    _patch_run(monkeypatch, _Proc(stdout=_text_event("ok")), calls=calls)

    llm.chat("CONSIGNE SYSTEME", "CONTEXTE")

    cmd = calls[0]["cmd"]
    assert Path(cmd[0]).name == "opencode.exe"
    assert cmd[1:] == ["run", "--format", "json", "--model", "opencode/big-pickle",
                       "--auto"]
    # Le prompt passe par stdin, jamais par argv : aucun caractère shell
    # n'est interprété par le shell.
    assert calls[0]["input"].startswith("CONSIGNE SYSTEME")
    assert "CONTEXTE" in calls[0]["input"]
    assert calls[0]["timeout"] == 180


def test_resolve_opencode_cmd_prefers_exe_on_path(monkeypatch, tmp_path):
    exe = tmp_path / "opencode.exe"
    exe.write_text("x")
    monkeypatch.setattr(llm.shutil, "which",
                        lambda c: str(exe) if c == "opencode.exe" else None)
    assert llm._resolve_opencode_cmd("opencode") == [str(exe)]


def test_resolve_opencode_cmd_extracts_target_from_npm_shim(monkeypatch, tmp_path):
    """Sous Windows npm ne dépose qu'un opencode.cmd : on lit le vrai .exe."""
    real_exe = tmp_path / "node_modules" / "@opencode" / "cli" / "bin" / "opencode.exe"
    real_exe.parent.mkdir(parents=True)
    real_exe.write_text("x")
    shim = tmp_path / "opencode.cmd"
    shim.write_text(
        "@ECHO off\r\nSET dp0=%~dp0\r\n"
        '"%dp0%\\node_modules\\@opencode\\cli\\bin\\opencode.exe"   %*\r\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(llm.shutil, "which",
                        lambda c: str(shim) if c == "opencode" else None)
    assert llm._resolve_opencode_cmd("opencode") == [str(real_exe)]


def test_resolve_opencode_cmd_falls_back_to_binary_when_absent(monkeypatch):
    monkeypatch.setattr(llm.shutil, "which", lambda c: None)
    assert llm._resolve_opencode_cmd("opencode") == ["opencode"]


def test_opencode_needs_no_api_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    _patch_run(monkeypatch, _Proc(stdout=_text_event("sans clé")))

    assert llm.chat("consigne", "contexte") == "sans clé"


def test_chat_json_parses_fenced_json(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    fenced = 'Voici la réponse :\n```json\n{"score": 75, "fit": "high"}\n```'
    _patch_run(monkeypatch, _Proc(stdout=_text_event(fenced)))

    assert llm.chat_json("consigne", "contexte") == {"score": 75, "fit": "high"}


def test_chat_returns_none_when_opencode_fails(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    calls = []
    _patch_run(monkeypatch, _Proc(stdout=_error_event(), returncode=1), calls=calls)
    # Retry réel, sans attendre les délais entre tentatives
    monkeypatch.setattr(utils.time, "sleep", lambda _s: None)

    assert llm.chat("consigne", "contexte") is None
    assert len(calls) == 3  # 3 tentatives avant l'abandon


def test_opencode_decodes_utf8_regardless_of_windows_locale(monkeypatch):
    """La locale Windows (cp1252) ne doit pas faire échouer la sortie."""
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    captured = {}

    def fake_run(cmd, **kwargs):
        captured.update(kwargs)
        return _Proc(stdout=_text_event('{"rationale": "référencement éàü"}'))

    monkeypatch.setattr(llm.subprocess, "run", fake_run)

    assert llm.chat("consigne", "contexte") == '{"rationale": "référencement éàü"}'
    assert captured["encoding"] == "utf-8"
    assert captured["errors"] == "replace"


def test_opencode_handles_none_stdout(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "opencode")
    _patch_run(monkeypatch, _Proc(stdout=None, stderr="", returncode=1))

    with pytest.raises(llm.LLMError):
        llm._chat_opencode("consigne", "contexte")


def test_openrouter_provider_uses_http(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    _no_subprocess(monkeypatch)
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return _Resp({"choices": [{"message": {"content": "reponse openrouter"}}]})

    monkeypatch.setattr(llm.requests, "post", fake_post)

    assert llm.chat("consigne", "contexte") == "reponse openrouter"
    assert captured["url"] == llm.OPENROUTER_URL
    assert captured["json"]["messages"][0]["role"] == "system"


def test_openrouter_without_api_key_returns_none(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    _no_subprocess(monkeypatch)

    assert llm.chat("consigne", "contexte") is None


def test_unknown_provider_falls_back_to_opencode(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "inconnu")
    _patch_run(monkeypatch, _Proc(stdout=_text_event("fallback")))

    assert llm.get_provider() == "opencode"
    assert llm.chat("consigne", "contexte") == "fallback"
