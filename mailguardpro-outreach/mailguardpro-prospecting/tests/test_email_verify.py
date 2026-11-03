"""Tests de l'extraction et la vérification d'emails."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.email_verify import extract_emails, verify_email


def test_extract_emails_basic():
    text = "Contactez contact@example.fr ou info@example.fr, jamais test@other.com"
    emails = extract_emails(text, context="example.fr")
    assert set(emails) == {"contact@example.fr", "info@example.fr"}


def test_extract_emails_without_context():
    emails = extract_emails("Mail: jean.dupont@boutique.fr")
    assert emails == ["jean.dupont@boutique.fr"]


def test_extract_no_emails():
    assert extract_emails("Pas d'email ici") == []


def test_extract_emails_decodes_url_encoding_artifact():
    """Artefact d'encodage HTML : '%20contact@...' -> 'contact@...'."""
    assert extract_emails("mailto:%20contact@example.fr",
                          context="example.fr") == ["contact@example.fr"]
    # Un '%' interne qui décoderait en espace doit être écarté, pas exporté
    assert extract_emails("x%20y@example.fr", context="example.fr") == []


def test_extract_emails_strips_phone_prefix():
    """Fin de numéro de téléphone collée devant l'email (page contact)."""
    assert extract_emails("Tél 05 46 85 58 40contact@soweb.io",
                          context="soweb.io") == ["contact@soweb.io"]
    assert extract_emails("écrivez-nous 06 82 64 59 51contact@rosaystudio.com",
                          context="rosaystudio.com") == ["contact@rosaystudio.com"]


def test_extract_emails_keeps_legit_digit_local():
    """Un local légitime commençant par des chiffres ne doit pas être rogné."""
    # '24h' ferait moins de 4 caractères après nettoyage -> conservé tel quel
    assert extract_emails("Tél 01 23 45 67 89 24h@studio.fr",
                          context="studio.fr") == ["24h@studio.fr"]
    # Sans numéro de téléphone devant, aucun nettoyage
    assert extract_emails("contact 40contact@soweb.io",
                          context="soweb.io") == ["40contact@soweb.io"]


def test_verify_email_format_invalid():
    assert verify_email("pas-un-email") == "invalid"
    assert verify_email("a@b") == "invalid"


def test_verify_email_generic_provider_risky():
    assert verify_email("jean@gmail.com") == "risky"


def test_verify_email_no_mx(monkeypatch):
    monkeypatch.setattr("src.email_verify.get_mx_records", lambda domain: [])
    assert verify_email("x@domaine-inexistant-xyz.fr") == "invalid"


def test_verify_email_smtp_accept(monkeypatch):
    monkeypatch.setattr("src.email_verify.get_mx_records", lambda domain: ["mx1.example.com"])
    monkeypatch.setattr("src.email_verify._smtp_check", lambda host, email, sender: True)
    assert verify_email("x@entreprise.fr") == "verified"


def test_verify_email_smtp_reject(monkeypatch):
    monkeypatch.setattr("src.email_verify.get_mx_records", lambda domain: ["mx1.example.com"])
    monkeypatch.setattr("src.email_verify._smtp_check", lambda host, email, sender: False)
    assert verify_email("x@entreprise.fr") == "invalid"


def test_verify_email_smtp_indeterminate(monkeypatch):
    monkeypatch.setattr("src.email_verify.get_mx_records", lambda domain: ["mx1.example.com"])
    monkeypatch.setattr("src.email_verify._smtp_check", lambda host, email, sender: None)
    assert verify_email("x@entreprise.fr") == "risky"
