/* =========================================================
   Past match store client

   Talks to the local SQLite server (server/server.js). If the
   page was opened straight from disk (file://) or the server
   is down, every call reports failure and match.js falls back
   to its localStorage mirror, so the dashboard still runs at
   an event where nobody can start Node.
   ========================================================= */

const MatchDB = (function () {
  const BASE = '/api/matches';

  // file:// has no server to talk to; skip the probe entirely.
  const supported = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  let online = false;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error ?? `${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  return {
    // True only after a successful list() — callers use it to decide whether a
    // write is expected to reach the DB or is going straight to the fallback.
    get online() {
      return online;
    },

    get supported() {
      return supported;
    },

    async list(limit = 100) {
      if (!supported) return null;
      try {
        const data = await request(`${BASE}?limit=${limit}`);
        online = true;
        return data.matches;
      } catch (error) {
        online = false;
        console.warn('[molkky] DB に接続できません。localStorage で継続します。', error.message);
        return null;
      }
    },

    async create(entry) {
      if (!supported) return null;
      try {
        const data = await request(BASE, { method: 'POST', body: JSON.stringify(entry) });
        online = true;
        return data.match;
      } catch (error) {
        online = false;
        console.warn('[molkky] 試合の保存に失敗しました。', error.message);
        return null;
      }
    },

    async remove(id) {
      if (!supported) return false;
      try {
        await request(`${BASE}/${id}`, { method: 'DELETE' });
        online = true;
        return true;
      } catch (error) {
        // A 404 means it is already gone — that is the state the caller wanted.
        console.warn('[molkky] 試合の削除に失敗しました。', error.message);
        return false;
      }
    },

    async clear() {
      if (!supported) return false;
      try {
        await request(BASE, { method: 'DELETE' });
        online = true;
        return true;
      } catch (error) {
        console.warn('[molkky] 履歴の削除に失敗しました。', error.message);
        return false;
      }
    },
  };
})();

window.MatchDB = MatchDB;
