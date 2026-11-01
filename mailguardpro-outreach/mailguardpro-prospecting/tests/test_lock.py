"""Tests du RunnerLock et des utilitaires."""

import json
import time
from pathlib import Path

from src.lock import RunnerLock, atomic_save_json, load_json_safe
from src.utils import normalize_domain


def test_lock_acquire_release(tmp_path):
    lock = tmp_path / "runner.lock"
    assert RunnerLock.acquire_or_skip(lock, "host1") is True
    assert lock.exists()
    RunnerLock.release(lock)
    assert not lock.exists()


def test_lock_blocks_other_host(tmp_path):
    lock = tmp_path / "runner.lock"
    RunnerLock.acquire_or_skip(lock, "host1")
    # Un autre host avec un lock valide -> skip
    assert RunnerLock.acquire_or_skip(lock, "host2") is False
    # Même host -> renouvelle sans bloquer
    assert RunnerLock.acquire_or_skip(lock, "host1") is True


def test_lock_expired_is_broken(tmp_path):
    lock = tmp_path / "runner.lock"
    expired = {
        "host": "host1",
        "pid": 1,
        "started_at": "2020-01-01T00:00:00Z",
        "expires_at": "2020-01-01T02:00:00Z",
    }
    lock.write_text(json.dumps(expired), encoding="utf-8")
    assert RunnerLock.acquire_or_skip(lock, "host2") is True
    data = json.loads(lock.read_text(encoding="utf-8"))
    assert data["host"] == "host2"


def test_atomic_save_and_load(tmp_path):
    file = tmp_path / "data.json"
    atomic_save_json({"a": 1, "b": "été"}, file)
    assert load_json_safe(file) == {"a": 1, "b": "été"}
    # Fichier corrompu -> None, pas d'exception
    corrupt = tmp_path / "bad.json"
    corrupt.write_text("{broken", encoding="utf-8")
    assert load_json_safe(corrupt) is None
    assert load_json_safe(tmp_path / "absent.json") is None


def test_normalize_domain():
    assert normalize_domain("https://www.Example.fr/page?x=1") == "example.fr"
    assert normalize_domain("http://SUB.example.com") == "sub.example.com"
    assert normalize_domain("Example.fr") == "example.fr"
