const controlCards = document.getElementById('control-cards');
const scoreActionbar = document.getElementById('score-actionbar');
const scoreEmpty = document.getElementById('score-empty');
const scorePreview = document.getElementById('score-preview');
const teamPanels = document.getElementById('team-panels');
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
    scoreActionbar.innerHTML = '';
    scoreActionbar.hidden = true;
    scoreEmpty.hidden = false;
    scorePreview.hidden = true;
    return;
  }

  scoreEmpty.hidden = true;
  scorePreview.hidden = false;
  renderTeamPanels(teamPanels, match);
  renderControls(match);
  renderActionbar(match);
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
    const currentBlock = isTurn
      ? `<div class="control-card__current">
           <span class="control-card__current-label">今の選手</span>
           <span class="control-card__current-name">${currentPlayer ? escapeHtml(currentPlayer.name) : '選手未登録'}</span>
         </div>`
      : `<p class="control-card__players">${
          team.players.length ? team.players.map((p) => escapeHtml(p.name)).join('、') : '選手未登録'
        }</p>`;

    card.innerHTML = `
      <div class="control-card__header">
        <strong>${escapeHtml(team.name)}</strong>
        <span class="control-card__score">${team.score} / ${MolkkyMatch.WIN_SCORE}</span>
      </div>
      ${currentBlock}
      <p class="control-card__misses">連続ミス ${team.consecutiveMisses} / ${MolkkyMatch.MAX_CONSECUTIVE_MISSES}${team.eliminated ? ' — 失格' : ''}</p>
      ${team.winner ? '<p class="control-card__turn">勝者！</p>' : isTurn ? '<p class="control-card__turn">このチームの番です</p>' : ''}
    `;

    controlCards.appendChild(card);
  });
}

function renderActionbar(match) {
  scoreActionbar.hidden = false;
  const matchOver = MolkkyMatch.hasWinner();
  const currentTeam = MolkkyMatch.getCurrentTeam();
  const currentPlayer = currentTeam ? MolkkyMatch.getCurrentPlayer(currentTeam) : null;
  const canScore = Boolean(currentTeam) && !matchOver;
  const winner = match.teams.find((t) => t.winner);

  const info = matchOver
    ? `<div class="score-actionbar__info score-actionbar__info--over">
         <span class="score-actionbar__team">試合終了</span>
         ${winner ? `<span class="score-actionbar__player">勝者: ${escapeHtml(winner.name)}</span>` : ''}
       </div>`
    : `<div class="score-actionbar__info">
         <span class="score-actionbar__team">${currentTeam ? escapeHtml(currentTeam.name) : ''} の番</span>
         <span class="score-actionbar__player">${currentPlayer ? escapeHtml(currentPlayer.name) : '選手未登録'}</span>
       </div>`;

  const pointButtons = Array.from(
    { length: MolkkyMatch.MAX_POINTS - MolkkyMatch.MIN_POINTS + 1 },
    (_, i) => {
      const points = i + MolkkyMatch.MIN_POINTS;
      return `<button type="button" class="point-btn" data-points="${points}" ${canScore ? '' : 'disabled'}>${points}</button>`;
    },
  ).join('');

  scoreActionbar.innerHTML = `
    ${info}
    <div class="point-grid">${pointButtons}</div>
    <div class="score-actionbar__actions">
      <button type="button" class="secondary miss-btn" data-action="miss" ${canScore ? '' : 'disabled'}>ミス (0)</button>
      <button type="button" class="secondary undo-btn" data-action="undo">元に戻す</button>
    </div>
    <p class="score-actionbar__hint">キー: <kbd>1</kbd>–<kbd>9</kbd> 得点 ・ <kbd>M</kbd> ミス ・ <kbd>Ctrl</kbd>+<kbd>Z</kbd> 元に戻す</p>
  `;

  scoreActionbar.querySelectorAll('.point-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (currentTeam) MolkkyMatch.addPoints(currentTeam.id, Number(btn.dataset.points));
    });
  });
  scoreActionbar.querySelector('[data-action="miss"]')?.addEventListener('click', () => {
    if (currentTeam) MolkkyMatch.recordMiss(currentTeam.id);
  });
  scoreActionbar.querySelector('[data-action="undo"]')?.addEventListener('click', () => MolkkyMatch.undoLast());
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Keyboard shortcuts for fast scoring at a live event:
//   1–9 = score those points, M = miss, Ctrl/Cmd+Z = undo.
// Only active on the score panel, and never while typing in a field.
function handleScoreKeydown(event) {
  const onScorePanel = !window.Dashboard || window.Dashboard.getActivePanel() === 'score';
  if (!onScorePanel) return;

  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

  const key = event.key;

  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'Z')) {
    event.preventDefault();
    MolkkyMatch.undoLast();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const currentTeam = MolkkyMatch.getCurrentTeam();
  if (!currentTeam || MolkkyMatch.hasWinner()) return;

  if (key >= '1' && key <= '9') {
    event.preventDefault();
    MolkkyMatch.addPoints(currentTeam.id, Number(key));
  } else if (key === 'm' || key === 'M') {
    event.preventDefault();
    MolkkyMatch.recordMiss(currentTeam.id);
  }
}

document.addEventListener('keydown', handleScoreKeydown);

// Transient inline feedback so the admin can't miss a bust or an elimination.
let scoreToastEl = null;
let scoreToastTimer = null;

function showScoreToast(message, variant) {
  if (!scoreToastEl) {
    scoreToastEl = document.createElement('div');
    scoreToastEl.className = 'score-toast';
    scoreToastEl.setAttribute('role', 'status');
    scoreToastEl.setAttribute('aria-live', 'assertive');
    document.body.appendChild(scoreToastEl);
  }

  scoreToastEl.className = `score-toast score-toast--${variant} is-visible`;
  scoreToastEl.textContent = message;

  clearTimeout(scoreToastTimer);
  scoreToastTimer = setTimeout(() => {
    scoreToastEl.classList.remove('is-visible');
  }, 2600);
}

MolkkyMatch.onEvent((event) => {
  if (event.type === 'bust') {
    showScoreToast(`${event.name} バスト！ ${event.from}+${event.points} → ${event.reset}`, 'bust');
  } else if (event.type === 'eliminated') {
    showScoreToast(`${event.name} 失格（3連続ミス）`, 'out');
  } else if (event.type === 'win') {
    showScoreToast(`🏆 ${event.name} の勝利！`, 'win');
  }
});

window.ScorePage = { render };
