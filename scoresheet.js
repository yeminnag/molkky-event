/* =========================================================
   Mölkky score sheet — shared dashboard + overlay renderer
   Reconstructs per-round running totals from each team's
   history (a snapshot is pushed BEFORE every throw).
   ========================================================= */

const SCORESHEET_WINDOW = 6;

// Running total after each throw for a team.
// history holds the state BEFORE each throw, so the total after
// throw i is history[i + 1].score, and the last throw is team.score.
function teamRoundTotals(team) {
  const n = team.history.length;
  if (n === 0) return [];
  const totals = [];
  for (let i = 1; i < n; i += 1) totals.push(team.history[i].score);
  totals.push(team.score);
  return totals;
}

function renderScoreSheet(container, match, options = {}) {
  if (!container) return;

  const { windowed = false, maxRounds = SCORESHEET_WINDOW, title = 'スコアシート' } = options;

  if (!match || !match.teams.length) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const rows = match.teams.map((team) => ({ team, totals: teamRoundTotals(team) }));
  const playedRounds = rows.reduce((max, r) => Math.max(max, r.totals.length), 0);

  // Column window: dashboard shows every round, overlay pages by `maxRounds`
  // (rounds 1–6, then 7–12, then 13–18 …) so the table never overflows.
  let startRound = 1;
  let columnCount;
  if (windowed) {
    const page = playedRounds > maxRounds ? Math.floor((playedRounds - 1) / maxRounds) : 0;
    startRound = page * maxRounds + 1;
    columnCount = maxRounds;
  } else {
    columnCount = Math.max(playedRounds, 1);
  }

  const roundNumbers = Array.from({ length: columnCount }, (_, i) => startRound + i);
  const currentTeam = MolkkyMatch.getCurrentTeam();
  const matchOver = MolkkyMatch.hasWinner();

  const headCells = roundNumbers
    .map((r) => `<th class="scoresheet__round">${r}</th>`)
    .join('');

  const bodyRows = rows
    .map(({ team, totals }) => {
      const isActive = currentTeam && team.id === currentTeam.id && !matchOver && !team.eliminated;
      const lastRound = totals.length; // 1-indexed round of most recent throw
      const rowClass = [
        'scoresheet__row',
        team.winner ? 'scoresheet__row--winner' : '',
        team.eliminated ? 'scoresheet__row--out' : '',
        isActive ? 'scoresheet__row--active' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const currentPlayer = isActive ? MolkkyMatch.getCurrentPlayer(team) : null;
      const playersLabel = team.players.length
        ? team.players.map((p) => escapeHtml(p.name)).join('・')
        : '';
      const teamMeta = currentPlayer
        ? `<span class="scoresheet__current-player">▶ ${escapeHtml(currentPlayer.name)}</span>`
        : playersLabel
          ? `<span class="scoresheet__team-players">${playersLabel}</span>`
          : '';

      const cells = roundNumbers
        .map((r) => {
          const value = r <= totals.length ? totals[r - 1] : '';
          const isLatest = r === lastRound && value !== '';
          return `<td class="scoresheet__cell${isLatest ? ' scoresheet__cell--latest' : ''}">${value === '' ? '' : value}</td>`;
        })
        .join('');

      return `
        <tr class="${rowClass}">
          <th class="scoresheet__team" scope="row">
            <span class="scoresheet__team-name">${escapeHtml(team.name)}</span>
            ${teamMeta}
          </th>
          ${cells}
          <td class="scoresheet__total">${team.score}</td>
        </tr>
      `;
    })
    .join('');

  const rangeLabel =
    windowed && startRound > 1
      ? `<span class="scoresheet__range">R${startRound}–${startRound + columnCount - 1}</span>`
      : '';

  container.hidden = false;
  container.innerHTML = `
    <div class="scoresheet__inner">
      <div class="scoresheet__head">
        <span class="scoresheet__title">${title}</span>
        ${rangeLabel}
      </div>
      <div class="scoresheet__scroll">
        <table class="scoresheet__table">
          <thead>
            <tr>
              <th class="scoresheet__corner">チーム</th>
              ${headCells}
              <th class="scoresheet__total-head">合計</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
