---
name: no-persistence-risk
description: The molkky app has no persistence — refresh loses the live match and all past matches
metadata:
  type: project
---

As of 2026-07-09 there is NO persistence anywhere in the molkky-event app (grep found no localStorage/sessionStorage/indexedDB/fetch). All state (`match`, `pastMatches`) lives in memory in `match.js`. A dashboard refresh, browser close, or crash wipes the live game AND all recorded past matches.

**Why:** The user wants to "manage scores and past datas," which is impossible durably without persistence.
**How to apply:** Adding a localStorage layer to `match.js` (persist on `notify()`, rehydrate on load) is Phase 1 and the prerequisite for the past-data features. See [[ui-improvement-roadmap]].
