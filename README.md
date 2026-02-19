<p align="center">
  <img src="https://img.shields.io/badge/⚽-VARify-10b981?style=for-the-badge&labelColor=121212" alt="VARify" height="60"/>
</p>

<p align="center">
  <strong>Real-time football match tracker with live scores, timelines, and team pages.</strong><br/>
  <em>Built with Django · Celery · Redis · SportAPI</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Django-5.2-092E20?style=flat-square&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/Celery-5.6-37814A?style=flat-square&logo=celery&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7.2-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.14-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active_Development-10b981?style=flat-square" />
  <img src="https://img.shields.io/badge/UI-Premium_Dark_Mode-1e1e1e?style=flat-square" />
</p>

---

## 📋 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Configuration](#%EF%B8%8F-configuration)
- [Usage](#-usage)
- [Management Commands](#-management-commands)
- [Data Models](#-data-models)
- [API Integration](#-api-integration)
- [CSS Architecture](#-css-architecture)
- [Roadmap](#-roadmap)

---

## 🎯 About

**VARify** is a real-time football match tracking application that brings live scores, detailed match timelines, and team profiles into a sleek dark-mode interface. It fetches data from the [SportAPI](https://rapidapi.com/) and presents it in a way that's both informative and visually stunning.

Whether you're tracking goals, cards, substitutions, or just browsing team stats — VARify has you covered.

---

## ✨ Features

### 🏟️ Live Match Dashboard
> The home page displays all matches currently being tracked, grouped by league with real-time scores.

- **Searchable league filter** — quickly find and toggle leagues by name
- **Collapsible league sections** — expand/collapse all or individually
- **Live score updates** — powered by Celery Beat every 10 minutes

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

### 🔍 Local Team Search
> Type any team name in the navbar search bar — results come instantly from the local database.

- **No API calls** — zero quota usage, works offline
- **Debounced input** — waits 200ms before querying
- **Clickable results** — each result links to the Team Detail page

### 📊 Team Detail Page
> A dedicated page for every team in the database.

- **Team header** with name and logo
- **Recent matches** — list of all tracked matches with scores
- **Squad** — players from the latest match lineup (position, number, captain badge, rating)

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Django 5.2 | Web framework, ORM, templating |
| **Task Queue** | Celery 5.6 | Async background tasks |
| **Broker** | Redis 7.2 | Message broker for Celery |
| **Scheduler** | Celery Beat | Periodic task scheduling |
| **Database** | SQLite3 | Development database |
| **API** | SportAPI (RapidAPI) | Live match data source |
| **Frontend** | HTML5 + CSS3 + JS | Dark mode UI with vanilla stack |
| **Icons** | Font Awesome 6.4 | UI iconography |

---

## 📁 Project Structure

```
VARify/
├── 📂 matches/                     # Main Django app
│   ├── 📂 management/commands/     # Custom CLI commands
│   │   ├── sync_matches.py         #   Sync live matches from API
│   │   └── reimport_events.py      #   Re-fetch events for existing matches
│   │
│   ├── 📂 migrations/              # Database migrations (0001–0009)
│   │
│   ├── 📂 static/matches/          # CSS architecture (modular)
│   │   ├── base.css                #   🌍 Global: variables, navbar, search
│   │   ├── live_match_list.css     #   🏠 Home: leagues, match rows, filters
│   │   ├── match_detail.css        #   ⚽ Match: timeline, lineups, events
│   │   └── team_detail.css         #   👥 Team: header, matches, squad grid
│   │
│   ├── 📂 templates/matches/       # Django templates
│   │   ├── base.html               #   🧱 Base layout (navbar + search)
│   │   ├── live_match_list.html    #   🏠 Home page
│   │   ├── match_detail.html       #   ⚽ Match detail + timeline
│   │   └── team_detail.html        #   👥 Team page
│   │
│   ├── models.py                   # League, Team, LiveMatch, MatchEvent, MatchLineup
│   ├── views.py                    # HomeView, match_detail, team_detail, search
│   ├── services.py                 # API fetching + incident mapping
│   ├── tasks.py                    # Celery tasks
│   └── admin.py                    # Django admin config
│
├── 📂 my_football_app/             # Django project config
│   ├── settings.py                 # Celery, Redis, database settings
│   ├── urls.py                     # URL routing
│   ├── celery.py                   # Celery app config
│   └── wsgi.py                     # WSGI entry point
│
├── .env                            # 🔑 API keys (not committed)
├── requirements.txt                # Python dependencies
├── manage.py                       # Django CLI
└── db.sqlite3                      # Development database
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.12+
- Redis server (for Celery)
- SportAPI key from [RapidAPI](https://rapidapi.com/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/OsmoxX/VARify.git
cd VARify

# 2. Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment variables
cp .env.example .env
# Edit .env with your API keys (see Configuration below)

# 5. Run migrations
python manage.py migrate

# 6. Start the development server
python manage.py runserver
```

### Starting Celery (for automatic sync)

```bash
# Terminal 1: Redis (if not running as a service)
redis-server

# Terminal 2: Celery Worker
celery -A my_football_app worker --loglevel=info

# Terminal 3: Celery Beat (scheduler)
celery -A my_football_app beat --loglevel=info
```

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
SPORT_API_KEY=your_rapidapi_key_here
SPORT_API_HOST=sportapi7.p.rapidapi.com
```

### Celery Beat Schedule

By default, matches sync every **10 minutes**. To change the interval, edit `settings.py`:

```python
CELERY_BEAT_SCHEDULE = {
    'pobieraj-mecze-co-5-minut': {
        'task': 'matches.tasks.sync_football_data',
        'schedule': crontab(minute='*/10'),  # Change to '*/1' for every minute
    },
}
```

---

## 📖 Usage

| Page | URL | Description |
|------|-----|-------------|
| 🏠 **Home** | `/` | Live match dashboard with league filters |
| ⚽ **Match Detail** | `/match/<id>/` | Match timeline + lineups |
| 👥 **Team Page** | `/team/<id>/` | Recent matches + squad |
| 🔍 **Search API** | `/search-api/?q=<query>` | JSON endpoint for team search |
| 🔧 **Admin** | `/admin/` | Django admin panel |

---

## 🔧 Management Commands

```bash
# Sync all live matches from the API
python manage.py sync_matches

# Re-import events for all matches (clears old data first)
python manage.py reimport_events

# Re-import events for a specific match
python manage.py reimport_events 5
```

---

## 🗄️ Data Models

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   League     │     │  LiveMatch   │     │    Team     │
├─────────────┤     ├──────────────┤     ├─────────────┤
│ api_id      │◄────│ league (FK)  │     │ api_id      │
│ name        │     │ home_team ───│────►│ name        │
│ country     │     │ away_team ───│────►│ logo_url    │
└─────────────┘     │ home_score   │     └─────────────┘
                    │ away_score   │
                    │ status       │
                    │ country_name │
                    └──────┬───────┘
                           │ 1:N
               ┌───────────┼───────────┐
               ▼                       ▼
      ┌────────────────┐     ┌────────────────┐
      │  MatchEvent    │     │  MatchLineup   │
      ├────────────────┤     ├────────────────┤
      │ incident_type  │     │ player_name    │
      │ player_name    │     │ shirt_number   │
      │ time           │     │ position       │
      │ is_home_team   │     │ is_starting_xi │
      │ incident_class │     │ is_captain     │
      │ home_score     │     │ avg_rating     │
      │ away_score     │     │ is_home_team   │
      └────────────────┘     └────────────────┘
```

### Smart Model Properties

The `MatchEvent` model includes **smart detection properties** that handle both old and new API data formats:

| Property | Logic |
|----------|-------|
| `is_goal` | `incident_type == 'goal'` OR `incidentClass ∈ {regular, penalty, ownGoal}` |
| `is_card` | `incident_type == 'card'` OR `incidentClass ∈ {yellow, yellowRed, red}` |
| `is_substitution` | `incident_type == 'substitution'` |
| `is_period_marker` | `incident_type == 'period'` OR `incidentClass == 'Unknown' + addedTime=999` |
| `formatted_time` | Suppresses `addedTime=999`, formats as `45+2'` |
| `running_score` | `"{home_score} - {away_score}"` when available |

---

## 🔌 API Integration

VARify uses the **SportAPI v7** from RapidAPI with the following endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /sport/football/events/live` | Fetch all live matches |
| `GET /event/{id}/incidents` | Fetch match events (goals, cards, subs...) |
| `GET /event/{id}/lineups` | Fetch match lineups |

### Incident Type Mapping

```
API incidentType → MatchEvent mapping:
┌───────────────┬──────────────────────────────────────────┐
│ goal          │ player, assists, score, incidentClass    │
│ card          │ player, color, reason, rescinded         │
│ substitution  │ playerIn, playerOut, injury              │
│ period        │ text (HT/FT), score, isLive              │
│ injuryTime    │ length (added minutes)                   │
│ varDecision   │ player, confirmed                        │
└───────────────┴──────────────────────────────────────────┘
```

---

## 🎨 CSS Architecture

The project follows a **modular CSS architecture** — each page has its own stylesheet, with global styles shared via `base.css`:

```
base.css                    ← Loaded on EVERY page
 ├── CSS Variables (:root)
 ├── Body & Typography
 ├── Navbar & Search Bar
 └── Main Content Layout

live_match_list.css         ← Home page only
 ├── Controls & Filters
 ├── League Sections
 ├── Match Rows
 └── Toggle Switch

match_detail.css            ← Match detail only
 ├── Timeline Feed
 ├── Event Cards
 ├── Period Markers
 └── Lineup Tables

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

- [ ] 📱 Responsive mobile layout
- [ ] 🔔 Push notifications for goals
- [ ] 📊 Match statistics (possession, shots, etc.)
- [ ] 🏆 League standings tables
- [ ] 👤 Player detail pages
- [ ] 🌍 Multi-language support (PL / EN)
- [ ] 🐳 Docker compose deployment
- [ ] ☁️ AWS / Railway deployment

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ❤️ and ⚽ by <a href="https://github.com/OsmoxX">OsmoxX</a></sub>
</p>
