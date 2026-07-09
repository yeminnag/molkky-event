---
name: ui-improvement-roadmap
description: The agreed 3-phase UI/UX plan for the molkky app
metadata:
  type: project
---

Agreed 2026-07-09. User wants better admin UI/UX for managing scores + past data, and more "climax"/drama for viewers during the stream. Reference video: youtu.be/5L6dJZaW8V8 (I can't watch it). Key preference: **keep the current visual style, add drama on top** — do not restyle existing panels/scoresheet.

Phases, in the user's chosen order:
1. **Persistence + admin scoring UX** — localStorage in `match.js`; bigger touch-friendly point grid; keyboard shortcuts; inline bust/elimination feedback. (`match.js`, `score.js`, `score.css`)
2. **Viewer climax** — score count-up + pulse, bust "50→25" animation, "needs X to win" + elimination-warning tension indicators, match-point banner, win celebration. Layered on, not a restyle. (`overlay.css`, `team-panels.js`, `broadcast.js`, new `overlay-fx.js`)
3. **Past data** — unify the overlapping Records/History panels, per-player stats, match replay/detail view, CSV/JSON export. (`records.js`, `history.js`, `match.js`)

See [[molkky-project]] and [[no-persistence-risk]].
