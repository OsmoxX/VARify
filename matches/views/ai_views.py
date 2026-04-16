import json
import logging

from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required

from accounts.decorators import require_tier
from accounts.models import SubscriptionTier
from matches.services.ai_agent import ask_ai_analyst, AIServiceError

logger = logging.getLogger(__name__)

# Maksymalna liczba tur historii przyjmowana od klienta
_MAX_HISTORY_TURNS = 40


@login_required
@require_tier(SubscriptionTier.PREMIUM)  # Tylko Premium ma dostęp do AI!
@require_POST
def ai_chat_endpoint(request):
    """
    Odbiera historię konwersacji od frontendu i przekazuje ją do Agenta AI.

    Oczekiwany payload:
        { "history": [{"role": "user"|"assistant", "content": "..."}, ...] }

    Kody odpowiedzi:
      200 — sukces
      400 — nieprawidłowy payload
      503 — API Google niedostępne (po wyczerpaniu prób)
      500 — nieoczekiwany błąd serwera
    """
    # ── 1. Parsowanie JSON ──────────────────────────────────────────
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Nieprawidłowy format JSON."}, status=400)

    # ── 2. Walidacja historii ───────────────────────────────────────
    history = data.get("history")

    if not isinstance(history, list) or not history:
        return JsonResponse({"error": "Brak historii konwersacji."}, status=400)

    # Przytnij do limitu (ochrona przed przepełnieniem kontekstu)
    history = history[-_MAX_HISTORY_TURNS:]

    # Weryfikuj strukturę każdego elementu
    validated: list[dict] = []
    for turn in history:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        content = content.strip()
        if not content:
            continue
        validated.append({"role": role, "content": content})

    if not validated:
        return JsonResponse(
            {"error": "Historia nie zawiera prawidłowych wiadomości."}, status=400
        )

    # Ostatnia wiadomość musi być od użytkownika
    if validated[-1]["role"] != "user":
        return JsonResponse(
            {"error": "Ostatnia wiadomość w historii musi być od użytkownika."},
            status=400,
        )

    # Ostatnie zapytanie nie może być zbyt długie
    last_query = validated[-1]["content"]
    if len(last_query) > 500:
        return JsonResponse(
            {"error": "Zapytanie jest zbyt długie (maks. 500 znaków)."}, status=400
        )

    # ── 3. Wywołanie Agenta AI ──────────────────────────────────────
    try:
        ai_response = ask_ai_analyst(validated)
        return JsonResponse({"response": ai_response}, status=200)

    except AIServiceError as exc:
        logger.warning(
            "[VARify AI] AIServiceError dla użytkownika %s: %s",
            request.user.username,
            exc.user_message,
        )
        return JsonResponse({"error": exc.user_message}, status=503)

    except Exception as exc:
        logger.exception(
            "[VARify AI] Nieoczekiwany błąd dla użytkownika %s: %s",
            request.user.username,
            exc,
        )
        return JsonResponse(
            {"error": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie za chwilę."},
            status=500,
        )
