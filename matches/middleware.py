import asyncio
import re

from asgiref.sync import markcoroutinefunction
from django.http import HttpResponseForbidden

# Sensitive paths/extensions probed by vulnerability scanners.
# Checked against the full URL (path + query string).
# Single source of truth for the path denylist. The ASGI shield in
# my_football_app/asgi.py imports this compiled regex directly (it fires first,
# before the WSGI/sync middleware), so both layers reject identical paths.
_MALICIOUS_PATH_RE = re.compile(
    r"""
    (?:
        \.env(?:[.\-_]|$)                       # .env, .env.production, .env-local
      | /\.git(?:/|$)                            # /.git/ or /.git at path end
      | \.git/config                             # git config file
      | \.(bak|old|save|orig|swp|sql
           |dump|log)(?:/|\?|&|\#|$)            # common backup / dump extensions
      | wp-(?:admin|login|config)                # WordPress targets
      | phpMyAdmin | phpmyadmin                  # phpMyAdmin
      | /etc/(?:passwd|shadow|hosts)             # LFI probes
      | (?:^|/)\.ht(?:access|passwd)             # .htaccess / .htpasswd

      # ── Spring Boot / Java actuator probes (this is a Django app) ──
      | /actuator(?:/|$)
      | (?:^|/)(?:heapdump|threaddump|configprops|logfile|env)(?:/|\?|$)

      # ── cloud credential dirs / dotfiles ──
      | (?:^|/)\.(?:aws|gcloud|azure|config|docker|credentials)(?:/|$)
      | (?:^|/)credentials(?:/|\?|$)

      # ── credential / secret / config dump files ──
      | (?:credentials|service[-_]?account|serviceaccount|secrets?
           |api[-_]?keys?|keys|appsettings|application|configuration
           |config|settings|database|private|aws|gcp|google|firebase
           |firebase-adminsdk|cloud|azure)
        \.(?:json|ya?ml|properties|ini|db)(?:/|\?|$)

      # ── server-side scripts this stack never serves ──
      | \.(?:php|phtml|asp|aspx|jsp|jspx|cgi)(?:/|\?|$)

      # ── framework profilers ──
      | (?:^|/)_?profiler(?:/|$)

      # ── infra / IaC manifests ──
      | docker-?compose[\w.\-]*\.ya?ml
      | (?:^|/)Dockerfile(?:/|\?|$)
      | (?:kubernetes|k8s)\.ya?ml
      | terraform\.tfvars

      # ── compressed dumps / archives ──
      | \.(?:sql|tar)\.(?:gz|bz2|xz)(?:/|\?|$)
      | \.zip(?:/|\?|$)
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Applied only to the `next` redirect parameter — stricter subset to
# defend against open-redirect + LFI chaining without false-positives.
_MALICIOUS_NEXT_RE = re.compile(
    r"""
    (?:
        \.env                                    # any .env file
      | \.\.(?:/|\\)                             # path traversal ../../
      | \.(bak|old|save|sql|dump)                # backup files
      | /\.git                                   # git directory
      | /etc/                                    # system directories
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


class MaliciousBotDefenseMiddleware:
    """
    Rejects requests that probe for sensitive files/directories (.env, .git, .bak …).

    Runs at position 0 in MIDDLEWARE — before SessionMiddleware and
    AuthenticationMiddleware — so no DB query is ever issued for bot traffic.
    Supports both sync (WSGI) and async (ASGI/Daphne) execution modes.
    """

    async_capable = True
    sync_capable = True

    def __init__(self, get_response):
        self.get_response = get_response
        if asyncio.iscoroutinefunction(self.get_response):
            markcoroutinefunction(self)

    # ── sync path (WSGI / Django test client) ────────────────────────────────
    def __call__(self, request):
        if asyncio.iscoroutinefunction(self):
            return self.__acall__(request)
        if self._is_suspicious(request):
            return HttpResponseForbidden("Not Allowed")
        return self.get_response(request)

    # ── async path (ASGI / Daphne) ───────────────────────────────────────────
    async def __acall__(self, request):
        if self._is_suspicious(request):
            return HttpResponseForbidden("Not Allowed")
        return await self.get_response(request)

    # ── detection logic ──────────────────────────────────────────────────────
    @staticmethod
    def _is_suspicious(request) -> bool:
        full_path = request.get_full_path()
        if _MALICIOUS_PATH_RE.search(full_path):
            return True
        next_param = request.GET.get("next", "")
        if next_param and _MALICIOUS_NEXT_RE.search(next_param):
            return True
        return False
