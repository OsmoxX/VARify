<p align="center">
  <img src="https://img.shields.io/badge/⚽-VARify-10b981?style=for-the-badge&labelColor=121212" alt="VARify" height="60"/>
</p>

<p align="center">
  <strong>Real-time football match tracker with live scores, WebSocket notifications, Stripe subscriptions, and tier-based access control.</strong><br/>
  <em>Built with Django · Django Channels · Celery · Redis · MySQL · Stripe · Docker · Sentry</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Django-5.2-092E20?style=flat-square&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/Channels-4.x-092E20?style=flat-square&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/Celery-5.6-37814A?style=flat-square&logo=celery&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7.2-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white" />
  <img src="https://img.shields.io/badge/Stripe-Payments-635BFF?style=flat-square&logo=stripe&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white" />
  <img src="https://img.shields.io/badge/Linting-Ruff-D7FF64?style=flat-square" />
  <img src="https://img.shields.io/badge/Security-Bandit_%26_Safety-red?style=flat-square" />
  <img src="https://img.shields.io/badge/Types-Mypy_%2B_django--stubs-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Tests-Pytest_%7C_99%25_coverage-10b981?style=flat-square" />
  <img src="https://img.shields.io/badge/Monitoring-Sentry-362D59?style=flat-square&logo=sentry&logoColor=white" />
</p>

---

## 📋 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Subscription & Access Control](#-subscription--access-control)
- [Real-Time Architecture](#-real-time-architecture)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [CI/CD Pipeline](#-cicd-pipeline--quality-gates)
- [Monitoring & Logs](#-monitoring--logs)
- [Project Structure](#-project-structure)
- [Configuration](#%EF%B8%8F-configuration)
- [Usage](#-usage)
- [Data Models](#-data-models)
- [API Integration](#-api-integration)
- [CSS Architecture](#-css-architecture)
- [Roadmap](#-roadmap)

---

## 🎯 About

**VARify** is a real-time football match tracking application that brings live scores, detailed match timelines, and team profiles into a sleek dark-mode interface. It fetches data from the [SportAPI](https://rapidapi.com/) and delivers instant notifications via WebSockets whenever a goal is scored, a card is given, or a substitution is made.

Whether you're tracking goals, cards, substitutions, or browsing team stats — VARify has you covered, **even when you're on a different page**.

VARify also features a **full subscription system powered by Stripe**, with tier-based access control (FREE → PLUS → PREMIUM) and a "soft paywall" UX that shows locked features with upgrade prompts rather than hiding them entirely.

---

## ✨ Features

### 🏟️ Live Match Dashboard
> The home page displays all matches currently being tracked, grouped by league with real-time scores.

- **Searchable league filter** — quickly find and toggle leagues by name
- **Collapsible league sections** — expand/collapse all or individually
- **Live score updates** — Celery Beat syncs every 2 minutes via a single API call
- **Live DOM updates** — scores and match statuses update instantly via WebSocket, no page refresh needed

### 🔔 Real-Time Notifications
> Subscribe to any match by clicking the bell icon and receive instant notifications.

- **Per-match subscriptions** — click the 🔔 bell on any live match to subscribe
- **WebSocket delivery** — notifications pushed server → browser in under a second
- **Persistent across pages** — connections survive navigation (managed globally in base.html)
- **Auto-reconnect** — WebSocket reconnects automatically after 3s if disconnected
- **Smart API usage** — detailed incidents (cards, subs) fetched **only** for subscribed matches

| Event Type | Icon | Description |
|------------|------|-------------|
| ⚽ Goal | Green football | Full score update with team names |
| 🟨 Yellow Card | Yellow card | Player name + minute |
| 🟥 Red Card | Red card | Player name + minute |
| 🔁 Substitution | Arrows | Player in ↑ / Player out ↓ + minute |
| ⏸️ Period Change | Clock/Pause | Halftime, 2nd half, extra time… |

### 🔔 Notification Panel
> A global notification bell in the navbar stores all received notifications.

- **Red badge** with unread count — pops in with animation
- **Dropdown panel** — shows all notifications with timestamp and icon
- **Persistent history** — stored in `localStorage`, survives page refresh (max 50 entries)
- **Notification sound** — a short programmatic audio ping via Web Audio API (no mp3 needed)
- **Mark all read** — opens panel to clear the badge; trash button wipes all notifications

### ⚽ Match Detail & Timeline
> Every match has a detailed timeline showing play-by-play events in a split Home vs Away layout.

| Event | Icon | Details |
|-------|------|---------|
| ⚽ Goal | Green football | Scorer, assists, running score |
| 🟨 Yellow Card | Yellow card | Player, reason |
| 🟥 Red Card | Red card | Player, reason |
| 🔁 Substitution | Arrows | Player in ↑ / Player out ↓ |
| 🕐 Period | Badge | HT / FT with halftime score |
| ⏱️ Injury Time | Clock | Added minutes |
| 📺 VAR Decision | Monitor | Confirmed / overturned |

- **Smart detection** — handles both old and new API data formats
- **Formatted time** — `45+2'` instead of raw addedTime values
- **Lineup tab** — starting XI + substitutes with shirt numbers and ratings
- **Match statistics tab** — possession, shots, corners and more

### 📅 Upcoming Matches Calendar
> Browse matches planned for the next 5 days with an interactive day-picker navigation.

- **5-day lookahead** — fetched and cached; Celery Beat keeps data fresh
- **Day-picker strip** — horizontal tabs (Dziś / Jutro / …) to switch between dates
- **League filter** — filter by top leagues or show all
- **?date= API param** — backend supports date filtering on `/api/upcoming-matches/`

### 🔍 Team & Player Search
> Type any team or player name in the navbar search bar.

- **Local team search** — zero API calls, works offline
- **Live player search** — fetches from SportAPI with debounced input
- **Clickable results** — links to Team or Player detail pages

### 📊 Team & Player Pages

- **Team detail** — recent matches, squad with ratings, league standings
- **Player detail** — personal info, position, current club

### 🔑 Authentication & Account Management
> Secure registration flow with email verification and social login out of the box.

- **Email Verification** — mandatory verification via SMTP, HTML welcome emails with CTA buttons, auto-login upon confirmation
- **Social Login** — fast registration and login using Google accounts (OAuth 2.0)
- **Personalized UX** — custom `AccountAdapter` overriding raw `django-allauth` messages with stylized UI notifications

### 📱 Progressive Web App (PWA)
> Install VARify globally on your device like a native app for the best experience.

- **PWA Compliance** — full support for home screen installation from mobile and desktop browsers
- **Richer Install UI** — enhanced installation prompts featuring dedicated mobile and desktop screenshots
- **Offline Support** — app works smoothly during network disconnects, includes a custom install banner

---

## 💳 Subscription & Access Control

VARify uses **Stripe Checkout** and **webhooks** to manage recurring subscriptions with three access tiers:

| Tier | Price | Access |
|------|-------|--------|
| 🆓 **Free** | 0 zł/mo | Live matches, upcoming calendar |
| ⚡ **Plus** | 9.99 zł/mo | + Club search, match lineups, H2H history, custom username |
| 👑 **Premium** | 19.99 zł/mo | + Advanced xG statistics, player search, no ads |

### Soft Paywall UX

Features are **not hidden** — they're shown as locked with elegant upgrade prompts:

- 🔍 **Search bar** (FREE) — disabled input with a lockable hover tooltip linking to `/subscribe/`
- ⚽ **Lineups tab** (FREE) — blurred shimmer placeholder with a centred "Unlock with PLUS" overlay
- 📊 **Statistics tab** (FREE/PLUS) — gold crown banner "Available in PREMIUM only"
- 👤 **Username field** (FREE) — `disabled` input with a small "Change available from PLUS" hint

### Backend Architecture

```python
# accounts/permissions.py
def has_access(user, required_tier) -> bool:
    """Hierarchical tier check: PREMIUM ≥ PLUS ≥ FREE"""

# accounts/decorators.py
@require_tier(SubscriptionTier.PLUS)
def team_detail_view(request, team_id): ...
```

- **`has_access(user, tier)`** — central helper respecting the hierarchy
- **`@require_tier(tier)`** — view decorator; redirects to `/subscribe/` with a `messages` warning, or returns JSON 403 for AJAX requests
- **Stripe webhook** (`/webhook/`) — verifies signature, updates `user.profile.tier` on `checkout.session.completed`
- **User Profile** auto-created via `post_save` signal for every new and existing user
- **Secrets** managed via `.env` — never hardcoded in `settings.py`


```
┌──────────────────────────────────────────────────────────────┐
│                    CELERY BEAT (every 2 min)                  │
│                                                              │
│  1 × API call → all live matches ──► compare with DB         │
│                                                              │
│  Goal detected?  ──► group_send ──► Redis Channel Layer      │
│  Status changed? ──► group_send ──► Redis Channel Layer      │
│  Subscribed?     ──► fetch incidents ──► 1 extra API call     │
│                  └──► card/sub detected ──► group_send        │
└────────────────────────────┬───────────────────────────────-─┘
                             │ Redis pub/sub
                             ▼
┌──────────────────────────────────────────────────────────────┐
│               DAPHNE / DJANGO CHANNELS (ASGI)                │
│                                                              │
│  MatchConsumer ──► WebSocket /ws/matches/{api_id}/           │
│                    Forwards: event_type, icon, message,      │
│                              home_score, away_score, status  │
└────────────────────────────┬─────────────────────────────────┘
                             │ WebSocket frame
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                BROWSER (JavaScript in base.html)             │
│                                                              │
│  window.VarifyWS  ──► manages WS connections per match       │
│                        reads/writes to localStorage          │
│                        auto-reconnects on close              │
│                                                              │
│  on message:                                                 │
│    VarifyNotif.add() ──► panel + sound + badge               │
│    showMatchToast()  ──► toast overlay (live page only)      │
│    updateMatchRow()  ──► live score/status DOM update        │
└──────────────────────────────────────────────────────────────┘
```

### API Request Budget

| Operation | Requests per cycle |
|-----------|-------------------|
| Sync all live matches | **1** (always) |
| Goal / status detection | 0 extra (from the same response) |
| Incidents (cards, subs) | **1 per subscribed match** only |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Django 5.2 | Web framework, ORM, templating |
| **WebSockets** | Django Channels 4 + Daphne | Async real-time communication (ASGI) |
| **Task Queue** | Celery 5.6 | Async background tasks |
| **Broker / Layer** | Redis 7.2 | Celery broker + Channel Layer pub/sub |
| **Scheduler** | Celery Beat + Django DB Scheduler | Periodic sync, DB-persisted schedules |
| **Database** | MySQL 8.0 | Production-grade relational database |
| **Payments** | Stripe + stripe-python | Subscription billing, webhooks, tier management |
| **API** | SportAPI v7 (RapidAPI) | Live match data source |
| **REST API** | Django REST Framework | Typed JSON API endpoints |
| **Frontend** | HTML5 + CSS3 + Vanilla JS | Dark mode UI, Web Audio API |
| **Static Files** | WhiteNoise | Efficient static file serving |
| **Monitoring** | Sentry SDK | Error tracking & performance monitoring |
| **Containerization** | Docker Compose | Orchestrates 5 services (web, celery, beat, db, redis) |
| **CI/CD** | GitHub Actions | Automated quality gates on every push |
| **Linting** | Ruff | Fast Python linter & formatter |
| **Security** | Bandit + Safety | Static code analysis & CVE scanning |
| **Type Checking** | Mypy + django-stubs | Full PEP 484 static typing (0 errors) |
| **Testing** | Pytest + pytest-cov | 167 tests, ~99% code coverage |
| **Icons** | Font Awesome 6.4 | UI iconography |

---

## 🔄 CI/CD Pipeline — Quality Gates

VARify uses **GitHub Actions** for a fully automated CI/CD pipeline that runs on every push and pull request to `main`/`master`. The pipeline enforces four independent quality gates, all of which must pass before code is considered production-ready.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Pipeline                         │
│                                                                     │
│  ┌───────────┐   ┌───────────────┐   ┌───────────┐   ┌──────────┐  │
│  │  1. Lint  │   │ 2. Security   │   │ 3. Types  │   │ 4. Test  │  │
│  │ (Ruff)    │   │ (Bandit+Sfty) │   │  (Mypy)   │   │ (Pytest) │  │
│  └───────────┘   └───────────────┘   └───────────┘   └──────────┘  │
│  ↳ run parallel                                   ↳ needs: [lint]   │
└─────────────────────────────────────────────────────────────────────┘
```

### Gate 1 — Linting `(Ruff)`

Ruff enforces code style and quality across the entire codebase in milliseconds.

```yaml
- name: Run Ruff (Lint & Format)
  run: ruff check .
```

- ✅ Detects unused imports, undefined names, style violations
- ✅ Drop-in replacement for Flake8, isort, and pyupgrade — **10–100× faster**

---

### Gate 2 — Security `(Bandit + Safety)`

Two tools run in parallel to cover both static code vulnerabilities and known CVEs in dependencies.

```yaml
- name: Run Bandit (Code security)
  run: bandit -r matches/ -x matches/tests/
- name: Run Safety
  run: safety check --full-report
```

| Tool | Scope | What it detects |
|------|-------|----------------|
| **Bandit** | Source code | Hardcoded secrets, SQL injection, insecure calls |
| **Safety** | `requirements.txt` | Known CVEs in third-party packages |

---

### Gate 3 — Static Typing `(Mypy + django-stubs)`

The codebase is fully annotated with PEP 484 type hints. Mypy runs with `django-stubs` for ORM-aware checking.

```yaml
- name: Run Mypy
  run: mypy . --explicit-package-bases
```

- ✅ **0 errors** across all 106 source files
- ✅ `django-stubs` understands QuerySets, model fields, and related managers
- ✅ Catches `None`-dereferences, wrong argument types, and missing return types at compile time

---

### Gate 4 — Testing `(Pytest)`

A comprehensive test suite runs against real MySQL + Redis services spun up as GitHub Actions service containers.

```yaml
services:
  db:   { image: mysql:8.0 }
  redis: { image: redis:7-alpine }
```

```yaml
- name: Run Pytest
  run: pytest --cov=matches --cov-report=xml
```

| Metric | Value |
|--------|-------|
| Total tests | **167** |
| Code coverage | **~99%** |
| Test categories | Models, Services, API Views, Views, Consumers, Tasks, Management Commands |
| Mocking strategy | `unittest.mock.patch` for all external API calls and WebSocket layers |

---

## 📡 Monitoring & Logs

VARify integrates **Sentry** for production-grade error tracking and performance monitoring.

```python
# my_football_app/settings.py
import sentry_sdk
sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", ""),
    traces_sample_rate=1.0,
)
```

| Capability | Description |
|-----------|-------------|
| **Error Tracking** | All unhandled exceptions are captured and grouped by type, file, and stack trace |
| **Performance Monitoring** | Transaction traces for HTTP requests and Celery tasks |
| **Release Tracking** | Link errors to specific code versions / deploys |
| **Alerting** | Configurable alerts via email, Slack, or PagerDuty |

To enable Sentry, set the `SENTRY_DSN` environment variable in your `.env` file.

---

## 📁 Project Structure

```
VARify/
├── 📂 .github/workflows/
│   └── ci.yml                      # 🚦 GitHub Actions CI pipeline (4 quality gates)
│
├── 📂 accounts/                    # Subscription & access control app
│   ├── 📂 migrations/              # DB migrations for Profile model
│   ├── 📂 static/accounts/css/     # subscribe.css — pricing page styles
│   ├── 📂 templates/accounts/      # subscribe.html — animated pricing page
│   ├── models.py                   # Profile model + SubscriptionTier choices + post_save signals
│   ├── permissions.py              # has_access(user, tier) — hierarchical tier check
│   ├── decorators.py               # @require_tier(tier) — view-level access guard
│   ├── views.py                    # subscribe_view, create_checkout_session, stripe_webhook
│   └── urls.py                     # /subscribe/, /create-checkout-session/<plan>/, /webhook/
│
├── 📂 matches/                     # Main Django app
│   ├── 📂 api_views/               # DRF JSON API endpoints (match, team, league, player)
│   ├── 📂 migrations/              # Database migrations
│   ├── 📂 models/                  # Modular models (League, Team, Match, Event, Lineup…)
│   ├── 📂 services/                # Business logic & SportAPI integration
│   │   ├── match_service.py        #   Live sync, upcoming fetch, incident detection
│   │   ├── player_service.py       #   Player data fetching & caching
│   │   ├── standings_service.py    #   League standings
│   │   └── football_api_service.py #   Low-level API client
│   ├── 📂 tests/                   # Comprehensive test suite (~167 tests)
│   ├── 📂 static/matches/          # CSS architecture (modular) + paywall.css
│   ├── 📂 templates/matches/       # Django templates
│   ├── consumers.py                # MatchConsumer (WebSocket handler)
│   ├── routing.py                  # WebSocket URL routing
│   └── tasks.py                    # Celery tasks
│
├── 📂 my_football_app/             # Django project config
│   ├── settings.py                 # Configuration (Celery, Redis, Channels, Sentry, Stripe via .env)
│   ├── asgi.py                     # ASGI entry point (HTTP + WebSocket)
│   ├── urls.py                     # URL routing
│   └── celery.py                   # Celery app config
│
├── docker-compose.yml              # 🐳 5 services: web + celery + beat + db + redis
├── Dockerfile                      # App image definition
├── .env                            # 🔑 Secrets (not committed)
├── .env.example                    # Template for required environment variables
└── requirements.txt                # Python dependencies
```

---

## ⚙️ Configuration

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False

# SportAPI (RapidAPI)
SPORT_API_KEY=your_rapidapi_key_here
SPORT_API_HOST=sportapi7.p.rapidapi.com

# Database (MySQL)
DB_NAME=varify_db
DB_USER=varify_user
DB_PASSWORD=your_db_password
DB_HOST=db
DB_PORT=3306

# Stripe (https://dashboard.stripe.com/apikeys)
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID_PLUS=price_...
STRIPE_PRICE_ID_PREMIUM=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Sentry (optional but recommended for production)
SENTRY_DSN=https://your-sentry-dsn-here
```

### Sync Interval

Edit `settings.py` to change how often matches are synced:

```python
CELERY_BEAT_SCHEDULE = {
    'aktualizuj-live-mecze': {
        'task': 'matches.tasks.sync_live_matches_task',
        'schedule': crontab(minute='*/2'),  # every 2 minutes
    },
    'pobierz-nadchodzace-mecze': {
        'task': 'matches.tasks.fetch_upcoming_matches_task',
        'schedule': crontab(minute='0', hour='*/3'),  # every 3 hours
    },
}
```

---

## 📖 Usage

| Page | URL | Description |
|------|-----|-------------|
| 🏠 **Home** | `/` | Live match dashboard with league filters + bell subscriptions |
| ⚽ **Match Detail** | `/match/<id>/` | Timeline + lineups (PLUS) + statistics (PREMIUM) |
| 📅 **Calendar** | `/calendar/` | Upcoming matches by day with day-picker |
| 👥 **Team Page** | `/team/<id>/` | Recent matches + squad + standings *(requires PLUS)* |
| 👤 **Player Page** | `/player/<api_id>/` | Player info, position, club |
| 🔍 **Search** | `/search-api/?q=<query>` | Team/player search *(navbar locked for FREE)* |
| 💳 **Pricing** | `/subscribe/` | Animated subscription pricing page |
| 🔧 **Admin** | `/admin/` | Django admin panel |
| 🔔 **Toggle Notification** | `POST /toggle-notifications/` | Subscribe / unsubscribe to match |
| 💳 **Checkout** | `/create-checkout-session/<plan>/` | Initiates Stripe Checkout session |
| 🪝 **Webhook** | `POST /webhook/` | Stripe webhook — updates user tier on payment |

---

## 🗄️ Data Models

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   League     │     │    LiveMatch     │     │    Team     │
├─────────────┤     ├──────────────────┤     ├─────────────┤
│ api_id      │◄────│ league (FK)      │     │ api_id      │
│ name        │     │ home_team ───────│────►│ name        │
│ country     │     │ away_team ───────│────►│ logo_url    │
│ is_top      │     │ home_score       │     └─────────────┘
└─────────────┘     │ away_score       │
                    │ status / minute  │     ┌──────────────────┐
                    │ stats_json       │     │  UpcomingMatch   │
                    └────────┬─────────┘     └──────────────────┘
                             │ 1:N
               ┌─────────────┼──────────────┐
               ▼             ▼              ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
     │  MatchEvent  │  │ MatchLineup  │  │ MatchSubscription│
     └──────────────┘  └──────────────┘  └──────────────────┘

┌─────────────────────────────────────────────────────┐
│                  accounts app                        │
├─────────────────────────────────────────────────────┤
│  User (Django built-in)                              │
│    └── Profile (OneToOne)                            │
│          ├── tier: FREE | PLUS | PREMIUM             │
│          ├── stripe_customer_id                      │
│          └── stripe_subscription_id                 │
└─────────────────────────────────────────────────────┘
```

---

## 🔌 API Integration

VARify uses **SportAPI v7** from RapidAPI:

| Endpoint | Purpose | Calls per cycle |
|----------|---------|-----------------| 
| `GET /sport/football/events/live` | All live matches + scores | **1** always |
| `GET /sport/football/scheduled-events/{date}` | Upcoming matches per day | **5** (one per day) |
| `GET /event/{id}/incidents` | Cards, subs for a match | **1** per subscribed match only |
| `GET /event/{id}/lineups` | Match lineups | On match detail page load |
| `GET /search/players/{name}/more` | Player search | On search input |
| `GET /player/{id}` | Player detail | On player page load |
| `GET /team/{id}/standings` | League standings for a team | On team page load |

---

## 🎨 CSS Architecture

```
base.css                    ← Loaded on EVERY page
 ├── CSS Variables (:root)
 ├── Body & Typography
 ├── Navbar & Search Bar
 ├── Notification Panel (bell, badge, dropdown, items)
 └── Main Content Layout

paywall.css                 ← Loaded on EVERY page (soft paywall UX)
 ├── Locked search bar with hover tooltip
 ├── Blur overlay for lineups (PLUS gate)
 ├── Premium crown banner (PREMIUM gate)
 └── Disabled input styles (username field)

live_match_list.css         ← Home page only
 ├── Controls & Filters
 ├── League Sections
 ├── Match Rows
 ├── Bell Buttons (inactive / bell-active states)
 └── Toast Notifications

match_detail.css            ← Match detail only
 ├── Tab Navigation
 ├── Timeline Feed
 ├── Event Cards
 ├── Period Markers
 ├── Lineup Tables
 └── Statistics Bars

calendar.css                ← Calendar page only
team_detail.css             ← Team page only

accounts/css/subscribe.css  ← Pricing page (standalone, no base.html)
 ├── Animated pitch-grid background
 ├── Floating glow orbs
 ├── Floating ⚽ football animations
 ├── Frosted-glass pricing cards
 └── Tier-aware button states
```

### Design Tokens

```css
:root {
    --bg-dark:      #121212;    /* Page background      */
    --nav-bg:       #1e1e1e;    /* Navbar background     */
    --card-bg:      #242424;    /* Card backgrounds      */
    --text-main:    #e0e0e0;    /* Primary text           */
    --text-light:   #f3f4f6;    /* Headings               */
    --text-muted:   #9ca3af;    /* Secondary text         */
    --accent:       #10b981;    /* Green accent (emerald) */
    --accent-hover: #059669;    /* Hover state            */
    --danger:       #ef4444;    /* Red (live dot, cards)  */
}
```

---

## 🗺️ Roadmap

- [x] 🔔 Real-time WebSocket notifications (goals, cards, subs, period changes)
- [x] 🔔 Global notification panel with unread badge + sound
- [x] 🔄 Live score & status DOM updates (no page refresh)
- [x] 🌐 Persistent WS connections across all pages
- [x] 📊 Match statistics tab
- [x] 👤 Player detail pages
- [x] 📅 Upcoming matches calendar with 5-day day-picker
- [x] 🏆 League standings tables
- [x] 🐳 Docker Compose deployment (5 services)
- [x] 🚦 GitHub Actions CI/CD with 4 quality gates
- [x] 🔍 Static type checking (Mypy + django-stubs, 0 errors)
- [x] 🛡️ Security scanning (Bandit + Safety)
- [x] 📡 Sentry error tracking & performance monitoring
- [x] 🧪 167 tests with ~99% code coverage
- [x] 💳 Stripe subscription billing (FREE / PLUS / PREMIUM tiers)
- [x] 🔒 Tier-based access control with soft paywall UX
- [x] 🔑 Secrets management via `.env` (no hardcoded keys)
- [ ] 📱 Responsive mobile layout
- [ ] 🌍 Multi-language support (PL / EN)
- [ ] ☁️ AWS / Railway deployment

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

> All contributions must pass the full CI pipeline (Ruff + Bandit + Mypy + Pytest) before merging.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ❤️ and ⚽ by <a href="https://github.com/OsmoxX">OsmoxX</a></sub>
</p>
