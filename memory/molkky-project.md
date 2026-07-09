---
name: molkky-project
description: What the molkky-event app is and how its pieces fit together
metadata:
  type: project
---

A vanilla-JS (no build step, no framework, no backend) web app for running and streaming Mölkky matches at events. UI text is Japanese.

- `index.html` = admin dashboard, 4 panels: teams / score / records / history, plus a link to the overlay.
- `overlay.html` = OBS/streaming overlay (opened in a separate tab).
- `match.js` = the game engine + state store (`MolkkyMatch`). Implements the rules: first to exactly 50 wins, bust over 50 resets to 25, 3 consecutive misses eliminates a team, auto-win when one team remains.
- `BroadcastChannel('molkky-event')` syncs admin dashboard → overlay in real time.
- `team-panels.js` + `scoresheet.js` are shared renderers used by both dashboard preview and overlay.

Git user is Xercluyn / repo yeminnag/molkky-event. See [[no-persistence-risk]] and [[ui-improvement-roadmap]].
