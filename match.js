const MAX_PAST_MATCHES = 100;

const WIN_SCORE = 50;
const BUST_RESET_SCORE = 25;
const MAX_CONSECUTIVE_MISSES = 3;
const MIN_POINTS = 1;
const MAX_POINTS = 12;

const STORAGE_KEY = 'molkky-event-state';
// Set once the pre-database localStorage history has been copied into SQLite.
const DB_MIGRATED_KEY = 'molkky-event-db-migrated';

let match = null;
let pastMatches = [];
const listeners = new Set();
// Game events (bust / eliminated / win / miss / score) for transient UI:
// inline admin feedback now, and overlay drama in a later phase.
const eventListeners = new Set();

function emit(event) {
  eventListeners.forEach((fn) => fn(event));
}
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('molkky-event') : null;

// Past matches live in SQLite (server/db.js); the live match stays in
// localStorage because it changes on every throw and must survive a reload
// even with no server running. localStorage also keeps a mirror of the past
// matches as an offline fallback — see hydrateFromDatabase().
// BroadcastChannel handles live cross-tab sync.
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ match, pastMatches }));
  } catch (e) {
    // storage unavailable or full — degrade gracefully to in-memory only.
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    match = data.match ? normalizeMatchState(data.match) : null;
    pastMatches = Array.isArray(data.pastMatches) ? data.pastMatches : [];
  } catch (e) {
    // corrupt or unreadable state — start fresh rather than crash.
  }
}

function notify(fromRemote = false) {
  persist();
  listeners.forEach((fn) => fn(match));
  if (!fromRemote && syncChannel) {
    syncChannel.postMessage({ match, pastMatches });
  }
}

if (syncChannel) {
  syncChannel.addEventListener('message', (event) => {
    match = event.data.match ? normalizeMatchState(event.data.match) : null;
    pastMatches = Array.isArray(event.data.pastMatches) ? event.data.pastMatches : [];
    notify(true);
  });
}

// Rehydrate before any subscriber renders. match.js runs before every other
// script, so populating these here is enough for the initial render. The DB
// read then replaces the mirrored past matches and re-renders on arrival.
loadPersisted();

function normalizeMatchState(state) {
  if (!state || !Array.isArray(state.teams)) return null;

  const teams = state.teams.map((t) => ({
    id: t.id,
    name: t.name,
    players: t.players || [],
    score: t.score ?? 0,
    history: t.history || [],
    consecutiveMisses: t.consecutiveMisses ?? 0,
    eliminated: Boolean(t.eliminated) || (t.consecutiveMisses ?? 0) >= MAX_CONSECUTIVE_MISSES,
    winner: Boolean(t.winner),
  }));

  const turnOrder = Array.isArray(state.turnOrder)
    ? state.turnOrder.filter((id) => teams.some((t) => t.id === id))
    : teams.map((t) => t.id);

  const playerIndices = { ...(state.playerIndices || {}) };
  teams.forEach((t) => {
    if (typeof playerIndices[t.id] !== 'number') playerIndices[t.id] = 0;
  });

  let currentTurnIndex = state.currentTurnIndex ?? 0;
  if (currentTurnIndex < 0 || currentTurnIndex >= turnOrder.length) currentTurnIndex = 0;

  const actionLog = Array.isArray(state.actionLog)
    ? state.actionLog.filter((id) => teams.some((t) => t.id === id))
    : [];

  return {
    teams,
    turnOrder,
    currentTurnIndex,
    playerIndices,
    actionLog,
    startedAt: state.startedAt ?? null,
    archived: Boolean(state.archived),
  };
}

function matchHasActivity(state) {
  return state.teams.some((t) => t.score > 0 || t.eliminated || t.winner);
}

// Running total after each throw, reconstructed from a team's history.
// history holds the state BEFORE each throw, so the total after throw i is
// history[i + 1].score and the last throw's total is team.score.
function teamRoundTotalsFromHistory(team) {
  const n = team.history.length;
  if (n === 0) return [];
  const totals = [];
  for (let i = 1; i < n; i += 1) totals.push(team.history[i].score);
  totals.push(team.score);
  return totals;
}

function buildPastMatchEntry(state, status) {
  const winner = state.teams.find((t) => t.winner);
  return {
    id: Date.now(),
    startedAt: state.startedAt,
    finishedAt: new Date().toISOString(),
    status,
    winnerName: winner?.name ?? null,
    teams: state.teams.map((t) => ({
      name: t.name,
      score: t.score,
      winner: t.winner,
      eliminated: t.eliminated,
      players: (t.players || []).map((p) => ({ name: p.name })),
      totals: teamRoundTotalsFromHistory(t),
    })),
  };
}

function archiveCurrentMatch(status) {
  if (!match || match.archived) return null;
  if (!matchHasActivity(match) && status !== 'finished') return null;

  const entry = buildPastMatchEntry(match, status);
  pastMatches.unshift(entry);
  pastMatches = pastMatches.slice(0, MAX_PAST_MATCHES);
  match.archived = true;
  // Render immediately off the in-memory copy; the DB write settles behind it.
  notify();
  saveEntryToDatabase(entry);
  return entry;
}

// buildPastMatchEntry() stamps a Date.now() id so the UI has a key right away.
// Once SQLite assigns the real primary key, swap it in — otherwise a later
// delete would target an id the database has never heard of.
async function saveEntryToDatabase(entry) {
  const saved = await MatchDB.create(entry);
  if (!saved) return; // Offline: the localStorage mirror is the record of truth.

  const target = pastMatches.find((e) => e.id === entry.id);
  if (!target) return; // Deleted or cleared while the request was in flight.

  target.id = saved.id;
  notify();
}

// Pull the authoritative history out of SQLite, and on first run copy across
// whatever the localStorage-only version of the app left behind.
async function hydrateFromDatabase() {
  const stored = await MatchDB.list(MAX_PAST_MATCHES);
  if (!stored) return; // Offline: keep the mirror loaded by loadPersisted().

  if (!stored.length && pastMatches.length && !migrationDone()) {
    await importLegacyMatches();
    return;
  }

  markMigrationDone();
  pastMatches = stored;
  notify();
}

async function importLegacyMatches() {
  // Oldest first, so SQLite ids ascend in the order the matches were played.
  const legacy = [...pastMatches].reverse();
  const imported = [];

  for (const entry of legacy) {
    const saved = await MatchDB.create(entry);
    if (!saved) return; // Server went away mid-import; retry on the next load.
    imported.unshift(saved);
  }

  markMigrationDone();
  console.info(`[molkky] ${imported.length} 件の過去試合を localStorage から DB へ移行しました。`);
  pastMatches = imported;
  notify();
}

function migrationDone() {
  try {
    return localStorage.getItem(DB_MIGRATED_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function markMigrationDone() {
  try {
    localStorage.setItem(DB_MIGRATED_KEY, '1');
  } catch (e) {
    // Storage unavailable: the empty-DB check still guards against re-import.
  }
}

function archiveIfFinished() {
  if (!match || match.archived || !hasWinner()) return;
  archiveCurrentMatch('finished');
}

function hasWinner() {
  return Boolean(match?.teams.some((t) => t.winner));
}

function getActiveTeams() {
  return match?.teams.filter((t) => !t.eliminated) ?? [];
}

function pushTeamHistory(team) {
  team.history.push({
    score: team.score,
    consecutiveMisses: team.consecutiveMisses,
    eliminated: team.eliminated,
    turnIndex: match.currentTurnIndex,
    playerIndices: { ...match.playerIndices },
  });
}

function checkAutoWin() {
  if (hasWinner()) return;
  const active = getActiveTeams();
  if (active.length === 1) {
    active[0].winner = true;
    emit({ type: 'win', teamId: active[0].id, name: active[0].name });
  }
}

function getCurrentTeam() {
  if (!match || hasWinner()) return null;

  for (let i = 0; i < match.turnOrder.length; i += 1) {
    const idx = (match.currentTurnIndex + i) % match.turnOrder.length;
    const teamId = match.turnOrder[idx];
    const team = match.teams.find((t) => t.id === teamId);
    if (team && !team.eliminated) return team;
  }

  return null;
}

// Which slot in a team's rotation throws next. Every team carries its own
// pointer, so this is meaningful even when it isn't the team's turn.
function getPlayerIndex(teamId) {
  const team = match?.teams.find((t) => t.id === teamId);
  if (!team || !team.players.length) return -1;
  return match.playerIndices[teamId] % team.players.length;
}

function getCurrentPlayer(team) {
  if (!team || !team.players.length) return null;
  const idx = match.playerIndices[team.id] % team.players.length;
  return team.players[idx];
}

function advanceTurn() {
  const team = getCurrentTeam();
  if (!team) return;

  if (team.players.length) {
    match.playerIndices[team.id] = (match.playerIndices[team.id] + 1) % team.players.length;
  }

  const len = match.turnOrder.length;
  for (let step = 1; step <= len; step += 1) {
    const nextIdx = (match.currentTurnIndex + step) % len;
    const nextId = match.turnOrder[nextIdx];
    const nextTeam = match.teams.find((t) => t.id === nextId);
    if (nextTeam && !nextTeam.eliminated) {
      match.currentTurnIndex = nextIdx;
      return;
    }
  }
}

const MolkkyMatch = {
  WIN_SCORE,
  BUST_RESET_SCORE,
  MAX_CONSECUTIVE_MISSES,
  MIN_POINTS,
  MAX_POINTS,

  get() {
    return match;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  onEvent(fn) {
    eventListeners.add(fn);
    return () => eventListeners.delete(fn);
  },

  hasWinner,
  getCurrentTeam,
  getCurrentPlayer,
  getPlayerIndex,

  // Reorder a team's rotation mid-match, for when a player has to be skipped
  // or taken out of sequence.
  //
  // playerIndices is deliberately left alone: the pointer stays on its slot and
  // the names move underneath it. So nudging the current thrower down one slot
  // hands the turn to the player below and puts the skipped player next — which
  // is the whole point. Moving anyone else around never disturbs whose turn it
  // is. The registered roster in teams.js is untouched: startNewMatch copies
  // the players, so this only reorders the live match.
  movePlayer(teamId, fromIndex, toIndex) {
    const team = match?.teams.find((t) => t.id === teamId);
    if (!team) return false;

    const players = team.players;
    const last = players.length - 1;
    if (fromIndex < 0 || fromIndex > last) return false;
    if (toIndex < 0 || toIndex > last) return false;
    if (fromIndex === toIndex) return false;

    const [moved] = players.splice(fromIndex, 1);
    players.splice(toIndex, 0, moved);
    notify();
    return true;
  },

  addPoints(teamId, points) {
    const team = match?.teams.find((t) => t.id === teamId);
    const currentTeam = getCurrentTeam();
    if (!team || team.eliminated || hasWinner() || !currentTeam || currentTeam.id !== teamId) return;

    pushTeamHistory(team);
    match.actionLog.push(team.id);
    team.consecutiveMisses = 0;
    const previousScore = team.score;
    const newScore = previousScore + points;

    if (newScore === WIN_SCORE) {
      team.score = WIN_SCORE;
      team.winner = true;
      emit({ type: 'win', teamId: team.id, name: team.name });
    } else if (newScore > WIN_SCORE) {
      team.score = BUST_RESET_SCORE;
      emit({ type: 'bust', teamId: team.id, name: team.name, from: previousScore, points, reset: BUST_RESET_SCORE });
    } else {
      team.score = newScore;
      emit({ type: 'score', teamId: team.id, name: team.name, points, total: newScore });
    }

    if (!team.winner) advanceTurn();

    archiveIfFinished();
    notify();
  },

  recordMiss(teamId) {
    const team = match?.teams.find((t) => t.id === teamId);
    const currentTeam = getCurrentTeam();
    if (!team || team.eliminated || hasWinner() || !currentTeam || currentTeam.id !== teamId) return;

    pushTeamHistory(team);
    match.actionLog.push(team.id);
    team.consecutiveMisses += 1;

    if (team.consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
      team.eliminated = true;
      emit({ type: 'eliminated', teamId: team.id, name: team.name });
    } else {
      emit({ type: 'miss', teamId: team.id, name: team.name, misses: team.consecutiveMisses });
    }

    if (!team.winner) {
      advanceTurn();
      checkAutoWin();
    }

    archiveIfFinished();
    notify();
  },

  undo(teamId) {
    const team = match?.teams.find((t) => t.id === teamId);
    if (!team || !team.history.length) return;

    const prev = team.history.pop();
    if (typeof prev === 'number') {
      team.score = prev;
    } else {
      team.score = prev.score;
      team.consecutiveMisses = prev.consecutiveMisses ?? 0;
      team.eliminated = prev.eliminated ?? false;
      match.currentTurnIndex = prev.turnIndex ?? match.currentTurnIndex;
      if (prev.playerIndices) match.playerIndices = { ...prev.playerIndices };
    }

    team.winner = false;
    if (!hasWinner()) match.archived = false;
    notify();
  },

  // Undo the most recent throw made by any team (used by the shared control bar).
  undoLast() {
    if (!match || !match.actionLog || !match.actionLog.length) return;

    const teamId = match.actionLog.pop();
    const team = match.teams.find((t) => t.id === teamId);
    if (!team || !team.history.length) {
      notify();
      return;
    }

    const prev = team.history.pop();
    team.score = prev.score;
    team.consecutiveMisses = prev.consecutiveMisses ?? 0;
    team.eliminated = prev.eliminated ?? false;
    match.currentTurnIndex = prev.turnIndex ?? match.currentTurnIndex;
    if (prev.playerIndices) match.playerIndices = { ...prev.playerIndices };
    team.winner = false;
    if (!hasWinner()) match.archived = false;
    notify();
  },

  resetMatch() {
    if (!match) return false;
    match.teams.forEach((t) => {
      t.score = 0;
      t.history = [];
      t.consecutiveMisses = 0;
      t.eliminated = false;
      t.winner = false;
    });
    match.currentTurnIndex = 0;
    match.teams.forEach((t) => {
      match.playerIndices[t.id] = 0;
    });
    match.actionLog = [];
    match.archived = false;
    notify();
    return true;
  },

  startNewMatch(selectedTeams) {
    if (match && !match.archived && matchHasActivity(match)) {
      archiveCurrentMatch(hasWinner() ? 'finished' : 'abandoned');
    }

    match = normalizeMatchState({
      teams: selectedTeams.map((t) => ({
        id: t.id,
        name: t.name,
        players: t.players || [],
        score: 0,
        history: [],
        consecutiveMisses: 0,
        eliminated: false,
        winner: false,
      })),
      startedAt: new Date().toISOString(),
      archived: false,
    });
    notify();
    return match;
  },

  getPastMatches() {
    return pastMatches;
  },

  deletePastMatch(id) {
    pastMatches = pastMatches.filter((entry) => entry.id !== id);
    notify();
    MatchDB.remove(id);
    return pastMatches;
  },

  clearPastMatches() {
    pastMatches = [];
    notify();
    MatchDB.clear();
  },

  // True once the past matches on screen came from SQLite rather than the
  // localStorage fallback.
  isDatabaseConnected() {
    return MatchDB.online;
  },

  endActiveMatch() {
    match = null;
    notify();
  },
};

// Fire-and-forget: the fetch cannot resolve until the remaining scripts have
// run, so every subscriber is registered before this calls notify().
hydrateFromDatabase();
