"""Fixtures partagées : chemin du projet, CRM sur base temporaire."""

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.crm import CRM  # noqa: E402


@pytest.fixture()
def crm(tmp_path):
    """CRM isolé sur une base temporaire, nettoyé après chaque test."""
    db = CRM(db_path=tmp_path / "test_crm.db")
    yield db
    db.close()


@pytest.fixture()
def sample_company():
    return {
        "domain": "example.fr",
        "name": "Exemple SARL",
        "sector": "e-commerce",
        "website": "https://example.fr",
        "city": "Paris",
        "country": "FR",
        "description": "Boutique en ligne de vêtements",
        "source": "google",
    }
