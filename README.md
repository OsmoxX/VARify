<p align="center">
  <img src="https://img.shields.io/badge/⚽-VARify-10b981?style=for-the-badge&labelColor=121212" alt="VARify" height="60"/>
</p>

<p align="center">
  <strong>Real-time football match tracker with live scores, WebSocket notifications, and team pages.</strong><br/>
  <em>Built with Django · Django Channels · Celery · Redis · WebSockets · SportAPI</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Django-5.2-092E20?style=flat-square&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/Channels-4.x-092E20?style=flat-square&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/Celery-5.6-37814A?style=flat-square&logo=celery&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7.2-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active_Development-10b981?style=flat-square" />
  <img src="https://img.shields.io/badge/UI-Premium_Dark_Mode-1e1e1e?style=flat-square" />
  <img src="https://img.shields.io/badge/WebSockets-Real--Time-6366f1?style=flat-square" />
</p>

---

## 📋 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Real-Time Architecture](#-real-time-architecture)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
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

### 🔍 Team & Player Search
> Type any team or player name in the navbar search bar.

- **Local team search** — zero API calls, works offline
- **Live player search** — fetches from SportAPI with debounced input
- **Clickable results** — links to Team or Player detail pages

### 📊 Team & Player Pages

- **Team detail** — recent matches, squad with ratings
- **Player detail** — personal info, position, current club

---

## 🏗 Real-Time Architecture

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
| **WebSockets** | Django Channels 4 + Daphne | Async real-time communication |
| **Task Queue** | Celery 5.6 | Async background tasks |
| **Broker / Layer** | Redis 7.2 | Celery broker + Channel Layer |
| **Scheduler** | Celery Beat | Periodic sync (2 min) |
| **Database** | MySQL | Production database |
| **API** | SportAPI (RapidAPI) | Live match data source |
| **Frontend** | HTML5 + CSS3 + Vanilla JS | Dark mode UI, Web Audio API |
| **Icons** | Font Awesome 6.4 | UI iconography |
| **Deployment** | Docker Compose | Container orchestration |

---

## 📁 Project Structure

```
VARify/
├── 📂 matches/                     # Main Django app
│   ├── 📂 migrations/              # Database migrations (0001–0019)
│   │
│   ├── 📂 static/matches/          # CSS architecture (modular)
│   │   ├── base.css                #   🌍 Global: variables, navbar, notif panel
│   │   ├── live_match_list.css     #   🏠 Home: leagues, match rows, filters, bells
│   │   ├── match_detail.css        #   ⚽ Match: timeline, lineups, stats, events
│   │   └── team_detail.css         #   👥 Team: header, matches, squad grid
│   │
│   ├── 📂 templates/matches/       # Django templates
│   │   ├── base.html               #   🧱 Base layout: navbar, notif panel, VarifyWS
│   │   ├── live_match_list.html    #   🏠 Home page: bells, toasts, DOM updates
│   │   ├── match_detail.html       #   ⚽ Match detail + timeline + stats
│   │   ├── team_detail.html        #   👥 Team page
│   │   └── player_detail.html      #   👤 Player page
│   │
│   ├── models.py                   # League, Team, LiveMatch, MatchEvent, MatchLineup,
│   │                               #   MatchSubscription, Player
│   ├── views.py                    # HomeView, match_detail, team_detail, toggle_notifications…
│   ├── services.py                 # API fetching, goal/incident detection, WS dispatch
│   ├── consumers.py                # MatchConsumer (WebSocket handler)
│   ├── routing.py                  # WebSocket URL routing
│   ├── tasks.py                    # Celery tasks (sync_live_matches)
│   └── admin.py                    # Django admin config
│
├── 📂 my_football_app/             # Django project config
│   ├── settings.py                 # Celery, Redis, Channels, database settings
│   ├── asgi.py                     # ASGI entry point (HTTP + WebSocket)
│   ├── urls.py                     # URL routing
│   └── celery.py                   # Celery app config
│
├── docker-compose.yml              # 🐳 web + celery + redis + db containers
├── Dockerfile                      # App image definition
├── .env                            # 🔑 API keys (not committed)
├── requirements.txt                # Python dependencies
└── manage.py                       # Django CLI
```

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- SportAPI key from [RapidAPI](https://rapidapi.com/)

### Installation (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/OsmoxX/VARify.git
cd VARify

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your API keys and DB credentials

# 3. Build and start all services
docker compose up --build

# 4. Run migrations (first time only)
docker compose exec web python manage.py migrate
```

The app will be available at `http://localhost:8000`.  
Celery Beat will automatically start syncing live matches every **2 minutes**.

### Manual Installation (without Docker)

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure .env, then migrate
python manage.py migrate

# 4. Start Daphne (ASGI — required for WebSockets)
daphne -b 0.0.0.0 -p 8000 my_football_app.asgi:application

# 5. In separate terminals: Celery Worker + Beat
celery -A my_football_app worker --loglevel=info
celery -A my_football_app beat --loglevel=info
```

> ⚠️ **`python manage.py runserver` does NOT support WebSockets.** You must use `daphne`.

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
SPORT_API_KEY=your_rapidapi_key_here
SPORT_API_HOST=sportapi7.p.rapidapi.com

DB_NAME=varify
DB_USER=varify_user
DB_PASSWORD=your_db_password
DB_HOST=db
DB_PORT=3306
```

### Sync Interval

Edit `settings.py` to change how often matches are synced:

```python
CELERY_BEAT_SCHEDULE = {
    'aktualizuj-live-mecze': {
        'task': 'matches.tasks.sync_live_matches',
        'schedule': crontab(minute='*/2'),  # every 2 minutes
    },
}
```

---

## 📖 Usage

| Page | URL | Description |
|------|-----|-------------|
| 🏠 **Home** | `/` | Live match dashboard with league filters + bell subscriptions |
| ⚽ **Match Detail** | `/match/<id>/` | Timeline + lineups + statistics |
| 👥 **Team Page** | `/team/<id>/` | Recent matches + squad |
| 👤 **Player Page** | `/player/<api_id>/` | Player info, position, club |
| 🔍 **Search** | `/search-api/?q=<query>` | Team/player search |
| 🔧 **Admin** | `/admin/` | Django admin panel |
| 🔔 **Toggle Notification** | `POST /toggle-notifications/` | Subscribe / unsubscribe to match |

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
                    │ status / minute  │
                    └────────┬─────────┘
                             │ 1:N
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  MatchEvent  │  │ MatchLineup  │  │ MatchSubscription│
    ├──────────────┤  ├──────────────┤  ├──────────────────┤
    │ incident_id  │  │ player_name  │  │ session_key      │
    │ incident_type│  │ shirt_number │  │ match (FK)       │
    │ player_name  │  │ position     │  │ created_at       │
    │ time         │  │ is_starting  │  └──────────────────┘
    │ home_score   │  │ is_captain   │
    │ away_score   │  │ avg_rating   │
    └──────────────┘  └──────────────┘
```

---

## 🔌 API Integration

VARify uses **SportAPI v7** from RapidAPI:

| Endpoint | Purpose | Calls per cycle |
|----------|---------|-----------------|
| `GET /sport/football/events/live` | All live matches + scores | **1** always |
| `GET /event/{id}/incidents` | Cards, subs for a match | **1** per subscribed match only |
| `GET /event/{id}/lineups` | Match lineups | On match detail page load |
| `GET /search/players/{name}/more` | Player search | On search input |
| `GET /player/{id}` | Player detail | On player page load |

---

## 🎨 CSS Architecture

```
base.css                    ← Loaded on EVERY page
 ├── CSS Variables (:root)
 ├── Body & Typography
 ├── Navbar & Search Bar
 ├── Notification Panel (bell, badge, dropdown, items)
 └── Main Content Layout

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

team_detail.css             ← Team page only
 ├── Team Header
 ├── Match History List
 └── Squad Grid
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
- [x] 🐳 Docker Compose deployment
- [ ] 📱 Responsive mobile layout
- [ ] 🏆 League standings tables
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

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ❤️ and ⚽ by <a href="https://github.com/OsmoxX">OsmoxX</a></sub>
</p>
