# VARify — backend (NestJS)

Przepisanie backendu Django na NestJS 12 + Prisma (MySQL 8) + BullMQ (Redis) + Socket.IO.

## Uruchomienie

```bash
cp .env.example .env            # uzupełnij DATABASE_URL, REDIS_URL, JWT_SECRET, SPORT_API_KEY…
npm ci
npx prisma migrate deploy       # stosuje prisma/migrations
npm run start:dev               # API: http://localhost:3001/api, Swagger: /api/docs (poza produkcją)
```

Cały stack (MySQL + Redis + API + frontend): `docker compose -f docker-compose.nest.yml up --build` (z katalogu głównego).

## Testy i jakość

```bash
npm run build && npm run lint && npm test
# testy integracyjne na prawdziwej bazie (bez zmiennej są pomijane):
DATABASE_URL=mysql://… npx prisma migrate deploy
TEST_DATABASE_URL=mysql://… npm test
```

## Architektura

| Obszar | Odpowiednik Django | Gdzie |
|---|---|---|
| Modele | `matches/models`, `accounts/models.py` | `prisma/schema.prisma` (+ `PushSubscription`, `StripeEvent`) |
| Sync live co 60 s | Celery `sync_live_matches` | `jobs/sync-matches.job.ts`, `matches/matches.service.ts` |
| Push / powiadomienia | `process_match_incidents_and_notify` | `jobs/push-notify.processor.ts` + czysta logika `matches/domain/push-planner.ts` |
| WebSocket | Channels `MatchConsumer` | `matches/matches.gateway.ts` (pokoje `match:*`, `user:*`, `global`) |
| Tiery / paywall | `@require_tier` | `TierGuard` + `@RequireTier()` (tier czytany z DB per żądanie) |
| Stripe | `accounts/views.py` | `accounts/` (podpis, idempotencja, `subscription.*`, `invoice.*`) |
| AI | `ai_agent.py` | `ai/` (PREMIUM, retry 503/500, bez ponowień 429) |

### Endpointy (`/api`)

| Metoda i ścieżka | Dostęp |
|---|---|
| `POST auth/register`, `POST auth/login`, `GET auth/me` | publiczne / JWT |
| `GET account`, `PATCH account/profile`, `POST account/password` | JWT (zmiana nazwy użytkownika: PLUS) |
| `GET matches/live?league=&top=&search=`, `GET matches/active?ids=` | publiczne |
| `GET matches/:id` | publiczne; składy+boisko **PLUS**, statystyki **PREMIUM** (reszta `null`) |
| `GET matches/:id/events?page=` / `GET matches/:id/lineups?team=` | publiczne / **PLUS** |
| `POST notifications/matches/:matchId/toggle`, `GET notifications/subscribed` | JWT **lub** nagłówek `X-Guest-Id` (UUID) |
| `GET notifications/push/public-key`, `POST notifications/push/(un)subscribe` | publiczne / JWT |
| `GET favorites`, `GET favorites/search?q=`, `POST favorites/:teamId/toggle`, `PATCH favorites/:teamId` | JWT |
| `GET teams`, `GET teams/:id`, `…/standings`, `…/matches` | **PLUS** |
| `GET leagues`, `GET leagues/:apiId`, `…/standings` | publiczne |
| `GET players?search=&team=`, `GET players/:apiId` | publiczne |
| `GET search?q=` | **PLUS** |
| `GET calendar?date=YYYY-MM-DD&tz=Europe/Warsaw&league=&top=` | publiczne |
| `GET images/(team\|player)/:apiId` | publiczne (cache w DB) |
| `POST ai/chat` | **PREMIUM** |
| `POST stripe/checkout/:plan`, `POST stripe/portal` | JWT |
| `POST stripe/webhook` | podpis `stripe-signature` |
| `GET health` | publiczne |

Identyfikatory: mecze, drużyny, ulubione, subskrypcje = **lokalne `id`**; ligi i zawodnicy = **`apiId`** (jak strony Django).

### Zasady, które warto znać

- **Czas:** `startTimestamp` z API zapisujemy 1:1 jako UTC (Django dodawało na sztywno +2 h). Kalendarz liczy granice dnia w strefie z parametru `tz`.
- **SportAPI:** retry z backoffem i jitterem dla 5xx/timeoutów, `Retry-After` dla 429/503; po wyczerpaniu limitu (429) wywołania są wstrzymywane lokalnie (cooldown).
- **Duplikaty powiadomień:** `notifiedEventIds` + `lastNotifiedScore` + markery `score:H:A`; cold-start uciszają historię starszą niż 2 min; blokada Redis per mecz.
- **Blacklista:** mecze, dla których `/incidents` zwraca 404/403/204, mają `hasIncidentData=false` i są pomijane.
- **Dzwoneczek:** atomowy `INSERT … ON DUPLICATE KEY UPDATE isActive = NOT isActive` + unikalne `(userId,matchId)` / `(sessionKey,matchId)`.
- **Webhook Stripe:** weryfikacja podpisu na surowym ciele, id zdarzenia zapisywane w tej samej transakcji (idempotencja); `past_due` nie odbiera planu, `subscription.deleted` → FREE.

## Znane braki względem Django

Logowanie społecznościowe (Google/allauth), weryfikacja e-mail i reset hasła, i18n (pl/uk — UI jest po angielsku), narzędzie `dev/simulate-push`, panel admina, widok „zakończone mecze wg dni” (nieużywany w URL-ach Django).
