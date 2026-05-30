"""
ASGI entrypoint for VARify.

Architecture & async-safety notes
───────────────────────────────────
HTTP traffic  → _ASGIBotShield → ProtocolTypeRouter → get_asgi_application()
                                  └─ Django MIDDLEWARE chain (sync middleware is
                                     automatically wrapped in sync_to_async by
                                     Django's ASGIHandler — no blocking event loop).

WebSocket     → _ASGIBotShield → ProtocolTypeRouter
                                  └─ AuthMiddlewareStack
                                       └─ CookieMiddleware
                                            └─ SessionMiddleware   (Channels — async)
                                                 └─ AuthMiddleware (Channels — uses
                                                      database_sync_to_async internally)
                                                      └─ URLRouter → MatchConsumer
                                                           (AsyncWebsocketConsumer —
                                                            fully non-blocking)

No raw ORM calls exist outside of thread-safe wrappers in this file or in
consumers.py.  All session / user lookups go through Django Channels'
AuthMiddlewareStack which calls database_sync_to_async under the hood.

_ASGIBotShield intercepts known vulnerability-scanner paths at the ASGI layer,
before ProtocolTypeRouter creates any coroutine task, preventing the
"took too long to shut down and was killed" event-loop saturation.
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

from matches import routing

# Single source of truth for the denylist — the ASGI shield fires first but
# rejects exactly the same paths as the WSGI/sync middleware.
from matches.middleware import _MALICIOUS_PATH_RE as _SHIELD_RE

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "my_football_app.settings")

_403_START = {
    "type": "http.response.start",
    "status": 403,
    "headers": [(b"content-type", b"text/plain; charset=utf-8")],
}
_403_BODY = {"type": "http.response.body", "body": b"Not Allowed"}


class _ASGIBotShield:
    """
    Outermost ASGI middleware — rejects malicious HTTP probes before
    ProtocolTypeRouter allocates any coroutine task or touches the DB.

    Fires for *all* protocols; only acts on HTTP scope so WebSocket
    handling is unaffected.
    """

    __slots__ = ("_app",)

    def __init__(self, app):
        self._app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and self._is_malicious(scope):
            await send(_403_START)
            await send(_403_BODY)
            return
        await self._app(scope, receive, send)

    @staticmethod
    def _is_malicious(scope) -> bool:
        path = scope.get("path", "")
        qs = scope.get("query_string", b"").decode("utf-8", errors="replace")
        full = path + ("?" + qs if qs else "")
        return bool(_SHIELD_RE.search(full))


# ── application graph ─────────────────────────────────────────────────────────
_channels_app = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AuthMiddlewareStack(URLRouter(routing.websocket_urlpatterns)),
    }
)

application = _ASGIBotShield(_channels_app)
