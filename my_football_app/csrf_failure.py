"""
Custom CSRF failure view.

Django returns a generic 403 page on CSRF failure and (with DEBUG=False)
hides the underlying reason. This wrapper logs the precise reason plus the
request context before delegating to Django's default 403 renderer, so the
cause shows up in container logs and Sentry.

Wired in via settings.CSRF_FAILURE_VIEW.
"""

import logging

from django.views.csrf import csrf_failure as default_csrf_failure

logger = logging.getLogger("matches")


def csrf_failure(request, reason=""):
    logger.warning(
        "CSRF failure: reason=%r path=%s method=%s has_csrf_cookie=%s "
        "origin=%r referer=%r user=%s",
        reason,
        request.path,
        request.method,
        "csrftoken" in request.COOKIES,
        request.META.get("HTTP_ORIGIN"),
        request.META.get("HTTP_REFERER"),
        getattr(getattr(request, "user", None), "username", "anonymous"),
    )
    return default_csrf_failure(request, reason=reason)
