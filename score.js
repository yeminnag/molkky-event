const controlCards = document.getElementById('control-cards');
const scoreEmpty = document.getElementById('score-empty');
const scorePreview = document.getElementById('score-preview');
const teamPanels = document.getElementById('team-panels');
const scoresheetSide = document.getElementById('scoresheet-side');
const scoresheet = document.getElementById('scoresheet');
const resetMatchBtn = document.getElementById('reset-match-btn');

resetMatchBtn.addEventListener('click', () => {
  if (!confirm('全チームのスコアをリセットしますか？')) return;
  MolkkyMatch.resetMatch();
});

MolkkyMatch.subscribe(render);

function render() {
  const match = MolkkyMatch.get();

  if (!match) {
    controlCards.innerHTML = '';
    scoreEmpty.hidden = false;
    scorePreview.hidden = true;
    scoresheetSide.hidden = true;
    renderScoreSheet(scoresheet, null);
    return;
  }

  scoreEmpty.hidden = true;
  scorePreview.hidden = false;
  scoresheetSide.hidden = false;
  renderTeamPanels(teamPanels, match);
  renderScoreSheet(scoresheet, match);
  renderControls(match);
}

function renderControls(match) {
  controlCards.innerHTML = '';
  const matchOver = MolkkyMatch.hasWinner();
  const currentTeam = MolkkyMatch.getCurrentTeam();

  match.teams.forEach((team) => {
    const isTurn = currentTeam && team.id === currentTeam.id && !matchOver && !team.eliminated;
    const card = document.createElement('article');
    card.className = `control-card${isTurn ? ' control-card--active' : ''}${team.eliminated ? ' control-card--out' : ''}`;

    const currentPlayer = isTurn ? MolkkyMatch.getCurrentPlayer(team) : null;
    const playerLabel = currentPlayer
      ? `今の選手: ${escapeHtml(currentPlayer.name)}`
      : team.players.length
        ? team.players.map((p) => escapeHtml(p.name)).join('、')
        : '選手未登録';

    const pointButtons = Array.from(
      { length: MolkkyMatch.MAX_POINTS - MolkkyMatch.MIN_POINTS + 1 },
      (_, i) => {
        const points = i + MolkkyMatch.MIN_POINTS;
        return `<button type="button" class="point-btn" data-points="${points}" ${isTurn ? '' : 'disabled'}>${points}</button>`;
      },
    ).join('');

    card.innerHTML = `
      <div class="control-card__header">
        <strong>${escapeHtml(team.name)}</strong>
        <span class="control-card__score">${team.score} / ${MolkkyMatch.WIN_SCORE}</span>
      </div>
      <p class="control-card__players">${playerLabel}</p>
      <p class="control-card__misses">連続ミス ${team.consecutiveMisses} / ${MolkkyMatch.MAX_CONSECUTIVE_MISSES}${team.eliminated ? ' — 失格' : ''}</p>
      ${isTurn ? '<p class="control-card__turn">このチームの番です</p>' : ''}
      <div class="point-grid">${pointButtons}</div>
      <div class="control-card__actions">
        <button type="button" class="secondary miss-btn" data-action="miss" ${isTurn ? '' : 'disabled'}>ミス (0)</button>
        <button type="button" class="secondary" data-action="undo">元に戻す</button>
      </div>
    `;

    if (matchOver || team.eliminated) {
      card.querySelectorAll('.point-btn').forEach((btn) => {
        btn.disabled = true;
      });
      const missBtn = card.querySelector('[data-action="miss"]');
      if (missBtn) missBtn.disabled = true;
    }

    card.querySelectorAll('.point-btn').forEach((btn) => {
      btn.addEventListener('click', () => MolkkyMatch.addPoints(team.id, Number(btn.dataset.points)));
    });
    card.querySelector('[data-action="miss"]')?.addEventListener('click', () => MolkkyMatch.recordMiss(team.id));
    card.querySelector('[data-action="undo"]').addEventListener('click', () => MolkkyMatch.undo(team.id));

    controlCards.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.ScorePage = { render };
