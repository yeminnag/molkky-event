/* =========================================================
   Mölkky past-match store (SQLite)

   One archived match spans four tables so that rounds and
   players stay queryable instead of being frozen into a JSON
   blob. The shape handed back to the client is identical to
   what buildPastMatchEntry() in match.js produces, so the
   history/records pages need no knowledge of any of this.
   ========================================================= */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DB_PATH = process.env.MOLKKY_DB ?? join(ROOT, 'data', 'matches.db');

const VALID_STATUS = new Set(['finished', 'abandoned']);

const SCHEMA_V1 = `
  CREATE TABLE matches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT,
    finished_at TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('finished', 'abandoned')),
    winner_name TEXT
  );
  CREATE INDEX idx_matches_finished_at ON matches (finished_at DESC);
  CREATE INDEX idx_matches_status      ON matches (status);

  CREATE TABLE match_teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   INTEGER NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    winner     INTEGER NOT NULL DEFAULT 0,
    eliminated INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_match_teams_match ON match_teams (match_id);
  CREATE INDEX idx_match_teams_name  ON match_teams (name);

  CREATE TABLE match_players (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id  INTEGER NOT NULL REFERENCES match_teams (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name     TEXT    NOT NULL
  );
  CREATE INDEX idx_match_players_team ON match_players (team_id);
  CREATE INDEX idx_match_players_name ON match_players (name);

  -- Running total after each throw, one row per round.
  CREATE TABLE match_rounds (
    team_id INTEGER NOT NULL REFERENCES match_teams (id) ON DELETE CASCADE,
    round   INTEGER NOT NULL,
    total   INTEGER NOT NULL,
    PRIMARY KEY (team_id, round)
  );
`;

let db = null;

function migrate(handle) {
  const { user_version: version } = handle.prepare('PRAGMA user_version').get();

  // Each step bumps user_version; add `if (version < 2) {...}` for future changes.
  if (version < 1) {
    handle.exec(SCHEMA_V1);
    handle.exec('PRAGMA user_version = 1');
  }
}

export function openDatabase() {
  if (db) return db;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);

  // WAL keeps reads from blocking the write that archives a match mid-event.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);

  return db;
}

export function closeDatabase() {
  if (!db) return;
  db.close();
  db = null;
}

function transaction(handle, fn) {
  handle.exec('BEGIN');
  try {
    const result = fn();
    handle.exec('COMMIT');
    return result;
  } catch (error) {
    handle.exec('ROLLBACK');
    throw error;
  }
}

/* ---------- validation -------------------------------------------------- */

// The client is trusted-ish (it is our own page on localhost), but a corrupt
// payload must fail loudly here rather than write half a match.
function normalizeEntry(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'match payload must be an object');

  const status = String(input.status ?? '');
  if (!VALID_STATUS.has(status)) {
    throw new HttpError(400, `status must be one of: ${[...VALID_STATUS].join(', ')}`);
  }

  if (!Array.isArray(input.teams) || input.teams.length === 0) {
    throw new HttpError(400, 'match must contain at least one team');
  }

  const teams = input.teams.map((team, index) => {
    const name = String(team?.name ?? '').trim();
    if (!name) throw new HttpError(400, `team at position ${index} is missing a name`);

    const totals = Array.isArray(team.totals) ? team.totals : [];
    const players = Array.isArray(team.players) ? team.players : [];

    return {
      name,
      score: Number.isFinite(team.score) ? Math.trunc(team.score) : 0,
      winner: Boolean(team.winner),
      eliminated: Boolean(team.eliminated),
      players: players
        .map((player) => String(player?.name ?? '').trim())
        .filter(Boolean)
        .map((name) => ({ name })),
      totals: totals.filter((total) => Number.isFinite(total)).map((total) => Math.trunc(total)),
    };
  });

  return {
    startedAt: input.startedAt ? String(input.startedAt) : null,
    finishedAt: input.finishedAt ? String(input.finishedAt) : new Date().toISOString(),
    status,
    winnerName: input.winnerName ? String(input.winnerName) : null,
    teams,
  };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- writes ------------------------------------------------------ */

export function insertMatch(input) {
  const handle = openDatabase();
  const entry = normalizeEntry(input);

  const insertMatchRow = handle.prepare(
    'INSERT INTO matches (started_at, finished_at, status, winner_name) VALUES (?, ?, ?, ?)',
  );
  const insertTeamRow = handle.prepare(
    'INSERT INTO match_teams (match_id, position, name, score, winner, eliminated) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertPlayerRow = handle.prepare(
    'INSERT INTO match_players (team_id, position, name) VALUES (?, ?, ?)',
  );
  const insertRoundRow = handle.prepare(
    'INSERT INTO match_rounds (team_id, round, total) VALUES (?, ?, ?)',
  );

  return transaction(handle, () => {
    const { lastInsertRowid } = insertMatchRow.run(
      entry.startedAt,
      entry.finishedAt,
      entry.status,
      entry.winnerName,
    );
    const matchId = Number(lastInsertRowid);

    entry.teams.forEach((team, teamIndex) => {
      const { lastInsertRowid: teamRowid } = insertTeamRow.run(
        matchId,
        teamIndex,
        team.name,
        team.score,
        team.winner ? 1 : 0,
        team.eliminated ? 1 : 0,
      );
      const teamId = Number(teamRowid);

      team.players.forEach((player, playerIndex) => {
        insertPlayerRow.run(teamId, playerIndex, player.name);
      });

      team.totals.forEach((total, roundIndex) => {
        insertRoundRow.run(teamId, roundIndex + 1, total);
      });
    });

    return { id: matchId, ...entry };
  });
}

export function deleteMatch(id) {
  const handle = openDatabase();
  const { changes } = handle.prepare('DELETE FROM matches WHERE id = ?').run(id);
  return Number(changes) > 0;
}

export function clearMatches() {
  const handle = openDatabase();
  const { changes } = handle.prepare('DELETE FROM matches').run();
  return Number(changes);
}

/* ---------- reads ------------------------------------------------------- */

// Three flat queries reassembled in memory, rather than one join that would
// duplicate match rows per round. Match counts here are small (an event, not a
// season), so the round trips are cheaper than de-duplicating a wide join.
export function listMatches({ limit = 100, offset = 0 } = {}) {
  const handle = openDatabase();

  const matches = handle
    .prepare(
      `SELECT id, started_at, finished_at, status, winner_name
         FROM matches
        ORDER BY finished_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);

  if (matches.length === 0) return [];

  const matchIds = matches.map((row) => row.id);
  const placeholders = matchIds.map(() => '?').join(', ');

  const teams = handle
    .prepare(
      `SELECT id, match_id, position, name, score, winner, eliminated
         FROM match_teams
        WHERE match_id IN (${placeholders})
        ORDER BY match_id, position`,
    )
    .all(...matchIds);

  const teamIds = teams.map((row) => row.id);
  const teamPlaceholders = teamIds.map(() => '?').join(', ');

  const players = teamIds.length
    ? handle
        .prepare(
          `SELECT team_id, name
             FROM match_players
            WHERE team_id IN (${teamPlaceholders})
            ORDER BY team_id, position`,
        )
        .all(...teamIds)
    : [];

  const rounds = teamIds.length
    ? handle
        .prepare(
          `SELECT team_id, total
             FROM match_rounds
            WHERE team_id IN (${teamPlaceholders})
            ORDER BY team_id, round`,
        )
        .all(...teamIds)
    : [];

  const playersByTeam = groupBy(players, 'team_id');
  const roundsByTeam = groupBy(rounds, 'team_id');
  const teamsByMatch = groupBy(teams, 'match_id');

  return matches.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    winnerName: row.winner_name,
    teams: (teamsByMatch.get(row.id) ?? []).map((team) => ({
      name: team.name,
      score: team.score,
      winner: Boolean(team.winner),
      eliminated: Boolean(team.eliminated),
      players: (playersByTeam.get(team.id) ?? []).map((player) => ({ name: player.name })),
      totals: (roundsByTeam.get(team.id) ?? []).map((round) => round.total),
    })),
  }));
}

export function countMatches() {
  const handle = openDatabase();
  return handle.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
}

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const bucket = map.get(row[key]);
    if (bucket) bucket.push(row);
    else map.set(row[key], [row]);
  });
  return map;
}
