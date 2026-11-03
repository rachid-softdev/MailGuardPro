"""Tests du superviseur de relance (run_until_done).

Aucun sous-processus ni acces reseau : subprocess.call et la liste des
fiches sont simules.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import run_until_done as sup  # noqa: E402


def _setup(monkeypatch, tmp_path, done_lines):
    """Prépare un checkpoint simulé et renvoie le compteur de relances."""
    ckpt = tmp_path / "done.txt"
    ckpt.write_text("\n".join(f"https://x/{i}" for i in range(done_lines)) + "\n",
                    encoding="utf-8")
    monkeypatch.setattr(sup, "CHECKPOINT", ckpt)
    calls = []

    def fake_call(cmd, cwd=None):
        calls.append(cmd)
        return 0

    monkeypatch.setattr(sup.subprocess, "call", fake_call)
    monkeypatch.setattr(sup, "fetch_profile_urls", lambda: [f"https://x/{i}"
                                                            for i in range(1000)])
    monkeypatch.setattr(sys, "argv", ["run_until_done.py"])
    return calls


def test_supervisor_aborts_when_no_progress(monkeypatch, tmp_path, capsys):
    """Sans progression du checkpoint, le superviseur abandonne (pas de boucle).

    Contrat : la 1re relance etablit la reference ; au-dela de --max-stalls
    relances steriles consecutives, on abandonne sans en lancer davantage.
    """
    calls = _setup(monkeypatch, tmp_path, done_lines=10)
    code = sup.main()
    assert code == 1
    out = capsys.readouterr().out
    assert "abandon" in out.lower()
    # 1 relance de reference + 3 steriles tolerees = 4, puis sortie (pas de boucle)
    assert len(calls) == 4
    assert "aucune progression (3/3)" in out


def test_supervisor_stops_when_all_profiles_done(monkeypatch, tmp_path, capsys):
    """Quand tout est traité, le superviseur ne lance rien."""
    calls = _setup(monkeypatch, tmp_path, done_lines=1000)
    code = sup.main()
    assert code == 0
    assert calls == []
    assert "toutes les fiches" in capsys.readouterr().out


def test_supervisor_relaunches_while_progressing(monkeypatch, tmp_path):
    """Chaque relance qui avance le checkpoint relance la suivante."""
    ckpt = tmp_path / "done.txt"
    ckpt.write_text("https://x/0\n", encoding="utf-8")
    monkeypatch.setattr(sup, "CHECKPOINT", ckpt)
    monkeypatch.setattr(sup, "fetch_profile_urls", lambda: [f"https://x/{i}"
                                                            for i in range(10)])
    monkeypatch.setattr(sys, "argv", ["run_until_done.py", "--round-limit", "1"])
    calls = []

    def fake_call(cmd, cwd=None):
        calls.append(cmd)
        # simule la progression de chaque relance : +1 fiche traitée
        with ckpt.open("a", encoding="utf-8") as fh:
            fh.write(f"https://x/{len(calls)}\n")
        return 0

    monkeypatch.setattr(sup.subprocess, "call", fake_call)
    code = sup.main()
    assert code == 0
    assert len(calls) == 9  # 9 fiches restantes -> 9 relances, puis arrêt
