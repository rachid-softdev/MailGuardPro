"""Tests de la découverte : requêtes par marché, parsing, exclusions, round-robin."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.discovery import _build_market_queries, _company_from_result, _is_excluded, discover
from src.google_search import SearchResult


FR_MARKET = {
    "code": "fr", "lang": "fr",
    "search_queries": ["agence web [place] SEO", "fixe"],
    "search_places": ["Paris", "Lyon"],
    "exclude_keywords": ["recrutement"],
    "target_countries": ["FR"],
}

INTL_MARKET = {
    "code": "intl", "lang": "en",
    "search_queries": ["web agency [place] SEO"],
    "search_places": ["London"],
    "exclude_keywords": ["hiring"],
    "target_countries": ["US", "UK"],
}


def test_build_market_queries_expands_places():
    queries = _build_market_queries(FR_MARKET)
    assert queries == ["agence web Paris SEO", "agence web Lyon SEO", "fixe"]
    assert _build_market_queries(INTL_MARKET) == ["web agency London SEO"]


def test_excluded_keywords_per_market():
    assert _is_excluded(SearchResult("Offre recrutement", "https://x.fr", "", 1), FR_MARKET)
    assert not _is_excluded(SearchResult("We are hiring", "https://x.fr", "", 1), FR_MARKET)
    assert _is_excluded(SearchResult("We are hiring", "https://x.fr", "", 1), INTL_MARKET)


def test_company_from_result_tags_market():
    r = SearchResult("Acme Web Agency - SEO", "https://acme.io/services",
                     "Web design and SEO", 1)
    company = _company_from_result(r, INTL_MARKET)
    assert company["domain"] == "acme.io"
    assert company["market"] == "intl"
    assert company["country"] == "US"  # premier pays cible du marché
    assert company["sector"] == "agence web"  # hint anglais détecté


def test_company_from_linkedin_result():
    r = SearchResult("Acme | LinkedIn", "https://www.linkedin.com/company/acme", "", 2)
    assert _company_from_result(r, FR_MARKET) is None


def test_discover_round_robin_both_markets(crm, monkeypatch):
    """Les deux marchés doivent être couverts (interleave), avec dédoublonnage."""
    calls = []

    class FakeSearcher:
        def search(self, query, num_results=None):
            calls.append(query)
            if "Paris" in query:
                return [SearchResult("Agence Pixel - SEO", "https://pixel-paris.fr", "SEO", 1)]
            if "London" in query:
                return [SearchResult("Pixel Agency - SEO", "https://pixel-london.io", "SEO", 1)]
            return []

        def close(self):
            pass

    monkeypatch.setattr("src.discovery.load_icp", lambda: {
        "markets": [FR_MARKET, INTL_MARKET],
    })

    summary = discover(crm, max_new=10, searcher=FakeSearcher())
    assert summary["new"] == 2
    # Interleave : les requêtes [place] des deux marchés alternent, avant les fixes
    assert calls[0] == "agence web Paris SEO"
    assert calls[1] == "web agency London SEO"
    assert calls.index("agence web Paris SEO") < calls.index("fixe")
    # Les entreprises portent leur marché
    assert crm.get_company_by_domain("pixel-paris.fr")["market"] == "fr"
    assert crm.get_company_by_domain("pixel-london.io")["market"] == "intl"

    # Dédoublonnage au 2e run
    summary2 = discover(crm, max_new=10, searcher=FakeSearcher())
    assert summary2["new"] == 0
    assert summary2["skipped"] == 2
