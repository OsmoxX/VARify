"""
views/match_views.py

Live match listing, match detail page, and WebSocket notification endpoints.
"""

import json
import logging

from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.cache import patch_cache_control
from django.views.decorators.http import require_POST
from django.views.generic import ListView

from matches.models import (
    LiveMatch,
    MatchEvent,
    MatchLineup,
    MatchSubscription,
    MissingPlayer,
)

from .helpers import (
    TOP_LEAGUES_CONFIG,
    ENDED_STATUSES,
    _build_league_groups,
    _league_entry,
    _subscribed_ids,
    _build_pitch_data,
    _current_match_minute,
    _should_show_event,
    _parse_stats,
)

logger = logging.getLogger(__name__)


def live_matches_view(request):
    """Strona główna: lista meczów live pogrupowanych wg ligi."""
    live_matches = LiveMatch.objects.filter(status__icontains="half").select_related(
        "home_team", "away_team", "league"
    )
    return render(
        request,
        "matches/live_match_list.html",
        {
            "matches": live_matches,
            "subscribed_ids_json": json.dumps(_subscribed_ids(request)),
        },
    )


def match_detail_view(request, match_id):
    """Szczegółowa strona meczu: wynik, oś czasu, składy, statystyki."""
    match = get_object_or_404(LiveMatch, id=match_id)

    is_ended = match.status.lower().strip() in ENDED_STATUSES

    if not (is_ended and (match.events.exists() or match.stats_json)):
        from matches.tasks.sync_tasks import fetch_match_details_task
        
        if is_ended:
            fetch_match_details_task(match.id, match.api_id)
        else:
            fetch_match_details_task.delay(match.id, match.api_id)

    events = MatchEvent.objects.filter(match=match).order_by(
        "-time", "-added_time", "-id"
    )
    if not is_ended:
        current_minute = _current_match_minute(match)
        status_lower = match.status.lower().strip()
        # Filter first, then sort descending so newest events appear at top
        sorted_events = sorted(
            [e for e in events if _should_show_event(e, status_lower, current_minute)],
            key=lambda e: (e.time, e.added_time or 0, e.id),
            reverse=True,
        )
        events = sorted_events  # type: ignore

    lineups_qs = MatchLineup.objects.filter(match=match)
    home_xi = list(
        lineups_qs.filter(is_home_team=True, is_starting_xi=True).order_by(
            "shirt_number"
        )
    )
    away_xi = list(
        lineups_qs.filter(is_home_team=False, is_starting_xi=True).order_by(
            "shirt_number"
        )
    )

    lineups = {
        "home_xi": home_xi,
        "home_subs": lineups_qs.filter(
            is_home_team=True, is_starting_xi=False
        ).order_by("shirt_number"),
        "away_xi": away_xi,
        "away_subs": lineups_qs.filter(
            is_home_team=False, is_starting_xi=False
        ).order_by("shirt_number"),
    }

    stats_periods = _parse_stats(match.stats_json)

    response = render(
        request,
        "matches/match_detail.html",
        {
            "match": match,
            "events": events,
            "lineups": lineups,
            "pitch_home": _build_pitch_data(
                home_xi, match.home_formation, is_home=True
            ),
            "pitch_away": _build_pitch_data(
                away_xi, match.away_formation, is_home=False
            ),
            "missing_home": MissingPlayer.objects.filter(
                match=match, is_home_team=True
            ),
            "missing_away": MissingPlayer.objects.filter(
                match=match, is_home_team=False
            ),
            "stats_periods": stats_periods,
        },
    )
    # Zakazujemy cache'owania dynamicznych stron meczowych (SW + przeglądarka)
    if not is_ended:
        patch_cache_control(response, no_store=True, no_cache=True, must_revalidate=True)
    return response


class HomeView(LoginRequiredMixin, ListView):
    """Strona główna: lista meczów live pogrupowanych wg ligi."""

    model = LiveMatch
    template_name = "matches/live_match_list.html"
    context_object_name = "matches"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        all_matches = LiveMatch.objects.select_related(
            "league", "home_team", "away_team"
        ).exclude(status="Ended")
        matches_by_api_id = _build_league_groups(all_matches)

        grouped_leagues = []
        for api_id, name, country in TOP_LEAGUES_CONFIG:
            data = matches_by_api_id.pop(api_id, None)
            if data:
                grouped_leagues.append(
                    _league_entry(data, country=country, is_top=True)
                )

        for data in sorted(matches_by_api_id.values(), key=lambda x: x["name"]):
            grouped_leagues.append(_league_entry(data, is_top=False))

        context["structured_data"] = grouped_leagues
        context["all_league_names"] = [lg["display_name"] for lg in grouped_leagues]
        context["subscribed_ids_json"] = json.dumps(_subscribed_ids(self.request))
        return context


@require_POST
def toggle_notifications(request, match_id):
    """
    Przełącza subskrypcję powiadomień (WebSocket + PWA Push) dla meczu.

    Używa filter().first() zamiast get_or_create() aby uniknąć IntegrityError
    (race condition / konflikt unique_together przy szybkich kliknięciach).

    Dodatkowo scala subskrypcję gościa z kontem użytkownika po zalogowaniu.
    """
    if not request.session.session_key:
        request.session.create()

    session_key = request.session.session_key

    try:
        match = LiveMatch.objects.get(api_id=match_id)
    except LiveMatch.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Mecz nie istnieje"}, status=404)

    subscription = None

    if request.user.is_authenticated:
        # Krok 1: Szukaj subskrypcji powiązanej z tym kontem
        subscription = MatchSubscription.objects.filter(
            match=match,
            user=request.user,
        ).first()

        if subscription is None:
            # Krok 2: Czy istnieje stara subskrypcja gościa z tej sesji?
            # Jeśli tak → połącz ją z kontem (merge) zamiast tworzyć duplikat
            guest_sub = MatchSubscription.objects.filter(
                match=match,
                user=None,
                session_key=session_key,
            ).first()
            if guest_sub:
                guest_sub.user = request.user
                guest_sub.save(update_fields=["user"])
                subscription = guest_sub
    else:
        # Gość: szukaj wyłącznie po session_key
        subscription = MatchSubscription.objects.filter(
            match=match,
            user=None,
            session_key=session_key,
        ).first()

    # Krok 3: Zmień stan lub utwórz nową subskrypcję
    if subscription is not None:
        subscription.is_active = not subscription.is_active
        subscription.save(update_fields=["is_active"])
    else:
        user = request.user if request.user.is_authenticated else None
        subscription = MatchSubscription.objects.create(
            match=match,
            user=user,
            session_key=session_key,
            is_active=True,
        )

    status_msg = "włączone 🔔" if subscription.is_active else "wyłączone 🔕"
    return JsonResponse({
        "status": "success",
        "is_subscribed": subscription.is_active,
        "message": f"Powiadomienia {status_msg}",
    })


def active_match_ids(request):
    """Zwraca podzbiór podanych api_id meczów, które są nadal live (status != 'Ended')."""
    ids_param = request.GET.get("ids", "")
    if not ids_param:
        return JsonResponse({"active_ids": []})

    try:
        requested_ids = [int(i) for i in ids_param.split(",") if i.strip()]
    except ValueError:
        return JsonResponse({"active_ids": []})

    active_ids = list(
        LiveMatch.objects.filter(api_id__in=requested_ids)
        .exclude(status="Ended")
        .values_list("api_id", flat=True)
    )
    return JsonResponse({"active_ids": active_ids})
