"""Tests de la logique de classification de verify_emails.py.

Ces garde-fous sont critiques : une mauvaise classification ecarte des leads
valides ('invalid' a tort) ou garde des adresses mortes. On teste donc
explicitement les deux pieges decouverts en production :

  1. un rejet RCPT pour cause de politique/IP n'est PAS une boite inexistante ;
  2. une gateway anti-spam ne peut pas confirmer un rejet non plus.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import verify_emails as v  # noqa: E402


def _patch_mx(monkeypatch, hosts):
    monkeypatch.setattr(v, "get_mx_records", lambda domain: hosts)


# -- _classify_reject : un 550 n'est pas forcement une boite morte -------------

def test_classify_true_unknown_is_invalid():
    assert v._classify_reject("550 Unknown user") == "invalid"
    assert v._classify_reject(
        "Recipient address rejected: User unknown in local recipient table") == "invalid"
    assert v._classify_reject("No such user") == "invalid"


def test_classify_policy_rejection_is_not_invalid():
    # Cas reels ayant produit de faux 'invalid' en production
    assert v._classify_reject(
        "5.7.1 Mail rejected by <Zoho Mail> for policy reasons") == "risky"
    assert v._classify_reject(
        "Access denied - Invalid HELO name (See RFC5321 4.1.1.1)") == "risky"
    assert v._classify_reject(
        "5.7.1 Service unavailable; client blocked using zen.spamhaus") == "risky"
    assert v._classify_reject("5.7.1 IP address blacklisted by recipient") == "risky"


def test_classify_unmotivated_rejection_defaults_to_risky():
    assert v._classify_reject("") == "risky"
    assert v._classify_reject("some opaque error") == "risky"


# -- _check : combinaison MX + gateway + motif --------------------------------

def test_check_no_mx_is_invalid(monkeypatch):
    _patch_mx(monkeypatch, [])
    assert v._check("x@mort.fr", smtp_enabled=True) == "invalid"


def test_check_gateway_mx_is_never_probed(monkeypatch):
    """Un MX Microsoft/Google ne doit pas etre sonde -> 'risky', pas 'invalid'."""
    _patch_mx(monkeypatch, ["foo-com.mail.protection.outlook.com"])

    def boom(*a, **k):
        raise AssertionError("_probe_rcpt ne doit pas etre appele sur un gateway")

    monkeypatch.setattr(v, "_probe_rcpt", boom)
    assert v._check("x@entreprise.fr", smtp_enabled=True) == "risky"


def test_check_accept_is_verified(monkeypatch):
    _patch_mx(monkeypatch, ["mx1.exemple.fr"])
    monkeypatch.setattr(v, "_probe_rcpt", lambda host, email, sender: (True, "OK"))
    assert v._check("x@entreprise.fr", smtp_enabled=True) == "verified"


def test_check_policy_reject_stays_risky(monkeypatch):
    _patch_mx(monkeypatch, ["mx1.exemple.fr"])
    monkeypatch.setattr(v, "_probe_rcpt",
                        lambda host, email, sender: (False, "IP blacklisted"))
    assert v._check("x@entreprise.fr", smtp_enabled=True) == "risky"


def test_check_true_unknown_is_invalid(monkeypatch):
    _patch_mx(monkeypatch, ["mx1.exemple.fr"])
    monkeypatch.setattr(v, "_probe_rcpt",
                        lambda host, email, sender: (False, "550 Unknown user"))
    assert v._check("x@entreprise.fr", smtp_enabled=True) == "invalid"


def test_check_smtp_disabled_falls_back_to_risky(monkeypatch):
    """Sans SMTP, une adresse plausible est 'risky' (jamais 'invalid')."""
    _patch_mx(monkeypatch, ["mx1.exemple.fr"])
    assert v._check("x@entreprise.fr", smtp_enabled=False) == "risky"


def test_check_public_provider_is_risky(monkeypatch):
    assert v._check("jean@gmail.com", smtp_enabled=True) == "risky"


def test_check_malformed_is_invalid(monkeypatch):
    assert v._check("pas-un-email", smtp_enabled=True) == "invalid"
