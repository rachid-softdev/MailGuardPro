"""
RunnerLock - Mécanisme de verrouillage cross-runner (pattern CommuneScraper)
Empêche l'exécution concurrente entre VPS et GitHub Actions.
AtomicSave - Écriture atomique de fichiers JSON pour éviter la corruption.
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Any

LOCK_TIMEOUT_HOURS = 2


@dataclass
class RunnerLock:
    host: str
    pid: int
    started_at: str
    expires_at: str

    def is_expired(self) -> bool:
        return time.time() > self._parse_iso(self.expires_at)

    @staticmethod
    def _parse_iso(s: str) -> float:
        return datetime.fromisoformat(s).timestamp()

    @classmethod
    def from_file(cls, path: Path) -> Optional["RunnerLock"]:
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return cls(**data)
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    def to_file(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.__dict__, f, indent=2)

    @classmethod
    def create(cls, host: str) -> "RunnerLock":
        started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        expires = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(time.time() + LOCK_TIMEOUT_HOURS * 3600),
        )
        return cls(host=host, pid=os.getpid(), started_at=started, expires_at=expires)

    @classmethod
    def acquire_or_skip(cls, lock_path: Path, host: str) -> bool:
        """True si on peut exécuter (lock libre ou expiré), False sinon."""
        existing = cls.from_file(lock_path)
        if existing is None:
            cls.create(host).to_file(lock_path)
            return True
        if existing.host == host:
            cls.create(host).to_file(lock_path)
            return True
        if not existing.is_expired():
            return False
        cls.create(host).to_file(lock_path)
        return True

    @classmethod
    def release(cls, lock_path: Path):
        if lock_path.exists():
            lock_path.unlink()


def atomic_save_json(data: Any, filepath: Path):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    tmp = filepath.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, filepath)


def load_json_safe(filepath: Path) -> Any:
    if not filepath.exists():
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return None
