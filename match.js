const MAX_PAST_MATCHES = 100;

const WIN_SCORE = 50;
const BUST_RESET_SCORE = 25;
const MAX_CONSECUTIVE_MISSES = 3;
const MIN_POINTS = 1;
const MAX_POINTS = 12;

let match = null;
let pastMatches = [];
const listeners = new Set();
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('molkky-event') : null;

function notify(fromRemote = false) {
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
  notify();
  return entry;
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

  hasWinner,
  getCurrentTeam,
  getCurrentPlayer,

  addPoints(teamId, points) {
    const team = match?.teams.find((t) => t.id === teamId);
    const currentTeam = getCurrentTeam();
    if (!team || team.eliminated || hasWinner() || !currentTeam || currentTeam.id !== teamId) return;

    pushTeamHistory(team);
    match.actionLog.push(team.id);
    team.consecutiveMisses = 0;
    const newScore = team.score + points;

    if (newScore === WIN_SCORE) {
      team.score = WIN_SCORE;
      team.winner = true;
    } else if (newScore > WIN_SCORE) {
      team.score = BUST_RESET_SCORE;
    } else {
      team.score = newScore;
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
    return pastMatches;
  },

  clearPastMatches() {
    pastMatches = [];
    notify();
  },

  endActiveMatch() {
    match = null;
    notify();
  },
};
