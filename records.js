/* =========================================================
   Mölkky score records (スコア記録)
   Round-by-round score table for every game, one category
   block per game (the live game plus each archived match).
   ========================================================= */

(function () {
  const listEl = document.getElementById('records-list');
  const emptyEl = document.getElementById('records-empty');

  // Game ids (String) whose card is collapsed. Persists across re-renders.
  const collapsedIds = new Set();

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function statusLabel(status) {
    if (status === 'finished') return '終了';
    if (status === 'abandoned') return '中断';
    if (status === 'live') return '進行中';
    return status;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Reconstruct running totals for the live match from each team's history.
  function liveTotals(team) {
    const n = team.history.length;
    if (n === 0) return [];
    const totals = [];
    for (let i = 1; i < n; i += 1) totals.push(team.history[i].score);
    totals.push(team.score);
    return totals;
  }

  function buildLiveRecord(match) {
    return {
      id: 'live',
      status: 'live',
      finishedAt: null,
      winnerName: match.teams.find((t) => t.winner)?.name ?? null,
      teams: match.teams.map((t) => ({
        name: t.name,
        players: t.players || [],
        totals: liveTotals(t),
        score: t.score,
        winner: t.winner,
        eliminated: t.eliminated,
      })),
    };
  }

  function recordHasThrows(rec) {
    return rec.teams.some((t) => (t.totals || []).length > 0);
  }

  function tableHtml(rec) {
    const rounds = rec.teams.reduce((max, t) => Math.max(max, (t.totals || []).length), 0);
    const roundNums = Array.from({ length: rounds }, (_, i) => i + 1);
    const head = roundNums.map((r) => `<th class="scoresheet__round">${r}</th>`).join('');

    const body = rec.teams
      .map((t) => {
        const totals = t.totals || [];
        const lastRound = totals.length;
        const rowClass = [
          'scoresheet__row',
          t.winner ? 'scoresheet__row--winner' : '',
          t.eliminated ? 'scoresheet__row--out' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const players = (t.players || []).length
          ? t.players.map((p) => escapeHtml(p.name)).join('・')
          : '';

        const cells = roundNums
          .map((r) => {
            const value = r <= totals.length ? totals[r - 1] : '';
            const latest = r === lastRound && value !== '';
            return `<td class="scoresheet__cell${latest ? ' scoresheet__cell--latest' : ''}">${value === '' ? '' : value}</td>`;
          })
          .join('');

        return `
          <tr class="${rowClass}">
            <th class="scoresheet__team" scope="row">
              <span class="scoresheet__team-name">${escapeHtml(t.name)}</span>
              ${players ? `<span class="scoresheet__team-players">${players}</span>` : ''}
            </th>
            ${cells}
            <td class="scoresheet__total">${t.score}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="scoresheet records-sheet">
        <div class="scoresheet__scroll">
          <table class="scoresheet__table">
            <thead>
              <tr>
                <th class="scoresheet__corner">チーム</th>
                ${head}
                <th class="scoresheet__total-head">合計</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function render() {
    if (!listEl) return;

    const records = [];
    const live = MolkkyMatch.get();
    // Skip an archived live match — it is already in getPastMatches().
    if (live && live.teams.length && !live.archived) {
      const rec = buildLiveRecord(live);
      if (recordHasThrows(rec)) records.push(rec);
    }
    MolkkyMatch.getPastMatches().forEach((rec) => records.push(rec));

    const playable = records.filter(recordHasThrows);

    if (!playable.length) {
      emptyEl.hidden = false;
      listEl.innerHTML = '';
      return;
    }

    emptyEl.hidden = true;
    const total = playable.length;

    listEl.innerHTML = playable
      .map((rec, i) => {
        const gameNumber = total - i;
        const date = formatDate(rec.finishedAt);
        const id = String(rec.id);
        const collapsed = collapsedIds.has(id);
        return `
          <article class="record-card${rec.status === 'live' ? ' record-card--live' : ''}${collapsed ? ' record-card--collapsed' : ''}">
            <div class="record-card__header">
              <button type="button" class="record-card__toggle" data-action="toggle" data-id="${id}" aria-expanded="${!collapsed}" aria-label="${collapsed ? '展開' : '折りたたむ'}">${collapsed ? '▸' : '▾'}</button>
              <div class="record-card__heading">
                <span class="record-card__title">ゲーム ${gameNumber}</span>
                <span class="record-card__status record-card__status--${rec.status}">${statusLabel(rec.status)}</span>
              </div>
              ${date ? `<time class="record-card__date">${date}</time>` : ''}
            </div>
            <div class="record-card__body">
              ${rec.winnerName ? `<p class="record-card__winner">勝者: ${escapeHtml(rec.winnerName)}</p>` : ''}
              ${tableHtml(rec)}
            </div>
          </article>
        `;
      })
      .join('');
  }

  if (listEl) {
    listEl.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="toggle"]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (collapsedIds.has(id)) collapsedIds.delete(id);
      else collapsedIds.add(id);
      render();
    });
  }

  window.RecordsPage = { render };

  MolkkyMatch.subscribe(() => render());
})();
