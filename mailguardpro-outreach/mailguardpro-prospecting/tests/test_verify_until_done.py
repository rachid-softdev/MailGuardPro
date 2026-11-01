"""Tests du superviseur de verification (verify_until_done).

Aucun sous-processus ni acces reseau : subprocess.call et counts() sont simules.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import verify_until_done as sup  # noqa: E402


def _setup(monkeypatch, found_values, argv=None):
    """found_values : suite de comptes 'found' renvoyes par counts().

    Le dernier element est repete si le superviseur interroge plus de fois.
    """
    seq = list(found_values)
    state = {"i": 0, "calls": []}

    def fake_counts():
        i = min(state["i"], len(seq) - 1)
        state["i"] += 1
        return {"found": seq[i], "verified": 0, "risky": 0, "invalid": 0}

    def fake_call(cmd, cwd=None):
        state["calls"].append(cmd)
        return 0

    monkeypatch.setattr(sup, "counts", fake_counts)
    monkeypatch.setattr(sup.subprocess, "call", fake_call)
    monkeypatch.setattr(sys, "argv", argv or ["verify_until_done.py"])
    return state


def test_stops_when_nothing_left_to_verify(monkeypatch, capsys):
    state = _setup(monkeypatch, [0])
    assert sup.main() == 0
    assert state["calls"] == []
    assert "tous les contacts sont verifies" in capsys.readouterr().out.lower()


def test_relaunches_while_progressing(monkeypatch):
    # counts() est appele 2x par tour (avant et apres) : 3 -> 1 -> 0, puis stop
    state = _setup(monkeypatch, [3, 1, 0])
    assert sup.main() == 0
    assert len(state["calls"]) == 1


def test_aborts_when_no_progress(monkeypatch, capsys):
    # 'found' ne bouge jamais : le superviseur doit abandonner, pas boucler
    state = _setup(monkeypatch, [5])
    assert sup.main() == 1
    assert "abandon" in capsys.readouterr().out.lower()
    # 1 relance de reference + 3 steriles tolerees, puis sortie
    assert len(state["calls"]) == 4


def test_round_limit_passed_through(monkeypatch):
    state = _setup(monkeypatch, [100, 90, 0],
                   argv=["verify_until_done.py", "--round-limit", "50"])
    sup.main()
    assert "--limit" in state["calls"][0]
