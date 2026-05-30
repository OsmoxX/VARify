"""
Tests for MaliciousBotDefenseMiddleware.

Covers:
  - legitimate requests that must pass through unchanged
  - malicious path patterns that must be blocked (HTTP 403)
  - malicious `next` query-param patterns that must be blocked
  - async (__acall__) execution path via a coroutine get_response
"""

import asyncio

import pytest
from django.http import HttpResponse, HttpResponseForbidden
from django.test import RequestFactory

from matches.middleware import MaliciousBotDefenseMiddleware


# ── helpers ───────────────────────────────────────────────────────────────────

def _sync_ok(_request):
    return HttpResponse("OK")


async def _async_ok(_request):
    return HttpResponse("OK")


def _make_sync(path, params=None):
    mw = MaliciousBotDefenseMiddleware(_sync_ok)
    rf = RequestFactory()
    req = rf.get(path, params or {})
    return mw(req)


def _make_async(path, params=None):
    mw = MaliciousBotDefenseMiddleware(_async_ok)
    rf = RequestFactory()
    req = rf.get(path, params or {})
    return asyncio.run(mw(req))


# ── legitimate requests ───────────────────────────────────────────────────────

class TestLegitimateRequests:
    @pytest.mark.parametrize("path", [
        "/pl/login/",
        "/en/matches/",
        "/uk/player/42/",
        "/api/matches/",
        "/api/leagues/",
        "/api/live-matches/",
        "/api/search/",
        "/webhook/",
        "/sw.js",
        "/static/matches/manifest.json",   # not a credential dump
        "/static/matches/js/base.js",      # .js must never be blocked
        "/environment/",                   # must not collide with bare 'env'
        "/",
    ])
    def test_allows_normal_paths_sync(self, path):
        response = _make_sync(path)
        assert response.status_code == 200

    @pytest.mark.parametrize("path", [
        "/pl/login/",
        "/api/matches/",
        "/",
    ])
    def test_allows_normal_paths_async(self, path):
        response = _make_async(path)
        assert response.status_code == 200

    def test_allows_safe_next_param(self):
        response = _make_sync("/pl/login/", {"next": "/pl/matches/"})
        assert response.status_code == 200

    def test_allows_next_with_match_id(self):
        response = _make_sync("/pl/login/", {"next": "/pl/matches/123/"})
        assert response.status_code == 200


# ── malicious paths blocked ───────────────────────────────────────────────────

MALICIOUS_PATHS = [
    # .env variants (root of the real incident)
    "/.env",
    "/.env.production",
    "/.env-local",
    "/.env_bak",
    "/backend/.env.bak",
    # git
    "/.git/config",
    "/.git/",
    "/repo/.git/HEAD",
    # backup extensions
    "/config.bak",
    "/db.sql",
    "/database.dump",
    "/app.old",
    "/secret.save",
    # WordPress probes
    "/wp-admin/",
    "/wp-login.php",
    "/wp-config.php",
    # phpMyAdmin
    "/phpMyAdmin/",
    "/phpmyadmin/index.php",
    # Apache config files
    "/.htaccess",
    "/.htpasswd",
    # LFI
    "/etc/passwd",
    "/etc/shadow",
    # Spring Boot / actuator probes
    "/actuator/heapdump",
    "/app/actuator/env",
    "/v1/actuator/configprops",
    "/api/heapdump",
    "/api/configprops",
    "/api/env",
    # cloud credential dirs / dotfiles
    "/.aws/credentials",
    "/.gcloud/credentials.json",
    "/config/.aws/credentials",
    "/.docker/config.json",
    "/credentials",
    # credential / secret / config dump files
    "/service-account.json",
    "/serviceaccount.json",
    "/firebase-credentials.json",
    "/secrets.json",
    "/secrets.yaml",
    "/config.json",
    "/api/application.yml",
    "/appsettings.json",
    "/app/settings.json",
    "/api/database.yml",
    # server-side scripts (Django serves none)
    "/phpinfo.php",
    "/info.php",
    "/settings.php",
    "/admin/phpinfo.php",
    # framework profilers
    "/_profiler",
    "/profiler/phpinfo",
    "/_profiler/open",
    # infra / IaC manifests
    "/docker-compose.yml",
    "/docker-compose.prod.yml",
    "/backend/docker-compose.yml",
    "/Dockerfile",
    "/kubernetes.yaml",
    "/k8s.yml",
    "/deploy/terraform.tfvars",
    # compressed dumps / archives
    "/backup.sql.gz",
    "/backup.tar.gz",
    "/backup.tar.bz2",
    "/backup.zip",
    "/www.zip",
]


class TestMaliciousPathsBlocked:
    @pytest.mark.parametrize("path", MALICIOUS_PATHS)
    def test_blocks_path_sync(self, path):
        response = _make_sync(path)
        assert isinstance(response, HttpResponseForbidden), (
            f"Expected 403 for path {path!r}, got {response.status_code}"
        )

    @pytest.mark.parametrize("path", MALICIOUS_PATHS)
    def test_blocks_path_async(self, path):
        response = _make_async(path)
        assert response.status_code == 403, (
            f"Expected 403 for path {path!r}, got {response.status_code}"
        )


# ── malicious `next` param blocked ───────────────────────────────────────────

MALICIOUS_NEXT_PARAMS = [
    "/pl/.env",
    "/pl/.env.production",
    "/backend/.env.bak",
    "/../../../etc/passwd",
    "/db.sql",
    "/.git/config",
]


class TestMaliciousNextParamBlocked:
    @pytest.mark.parametrize("next_val", MALICIOUS_NEXT_PARAMS)
    def test_blocks_next_param_sync(self, next_val):
        response = _make_sync("/pl/login/", {"next": next_val})
        assert response.status_code == 403, (
            f"Expected 403 for next={next_val!r}, got {response.status_code}"
        )

    @pytest.mark.parametrize("next_val", MALICIOUS_NEXT_PARAMS)
    def test_blocks_next_param_async(self, next_val):
        response = _make_async("/pl/login/", {"next": next_val})
        assert response.status_code == 403, (
            f"Expected 403 for next={next_val!r}, got {response.status_code}"
        )


# ── async detection flag ──────────────────────────────────────────────────────

class TestAsyncCapable:
    def test_sync_get_response_not_marked_as_coroutine(self):
        mw = MaliciousBotDefenseMiddleware(_sync_ok)
        assert not asyncio.iscoroutinefunction(mw)

    def test_async_get_response_marked_as_coroutine(self):
        mw = MaliciousBotDefenseMiddleware(_async_ok)
        assert asyncio.iscoroutinefunction(mw)
