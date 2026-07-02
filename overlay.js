const MATCH_TEAMS_STORAGE_KEY = 'molkkyMatchTeams';
const MATCH_STATE_STORAGE_KEY = 'molkkyMatchState';

const WIN_SCORE = 50;
const BUST_RESET_SCORE = 25;
const MIN_POINTS = 1;
const MAX_POINTS = 12;

const broadcastArea = document.getElementById('broadcast-area');
const controlCards = document.getElementById('control-cards');
const resetMatchBtn = document.getElementById('reset-match-btn');

resetMatchBtn.addEventListener('click', resetMatch);

let match = loadMatch();
render();

function loadMatch() {
  const savedState = localStorage.getItem(MATCH_STATE_STORAGE_KEY);
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      if (parsed && Array.isArray(parsed.teams)) {
        return { teams: parsed.teams.map(normalizeTeam) };
      }
    } catch (e) {
      /* fall through to rebuild from selected teams */
    }
  }

  const teamsRaw = localStorage.getItem(MATCH_TEAMS_STORAGE_KEY);
  if (!teamsRaw) return null;

  let selectedTeams;
  try {
    selectedTeams = JSON.parse(teamsRaw);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(selectedTeams) || selectedTeams.length < 2) return null;

  return { teams: selectedTeams.map(normalizeTeam) };
}

function normalizeTeam(t) {
  return {
    id: t.id,
    name: t.name,
    players: t.players || [],
    score: t.score || 0,
    history: Array.isArray(t.history) ? t.history : [],
    winner: t.winner || false,
    currentPlayerIndex: t.currentPlayerIndex || 0,
    lastPlayerName: t.lastPlayerName || null,
    lastPoints: typeof t.lastPoints === 'number' ? t.lastPoints : null,
  };
}

function saveMatch() {
  localStorage.setItem(MATCH_STATE_STORAGE_KEY, JSON.stringify(match));
}

function hasWinner() {
  return match.teams.some((t) => t.winner);
}

function getCurrentPlayer(team) {
  if (!team.players.length) return null;
  return team.players[team.currentPlayerIndex % team.players.length];
}

function addPoints(teamId, points) {
  const team = match.teams.find((t) => t.id === teamId);
  if (!team || hasWinner()) return;

  const currentPlayer = getCurrentPlayer(team);

  team.history.push({
    score: team.score,
    winner: team.winner,
    currentPlayerIndex: team.currentPlayerIndex,
    lastPlayerName: team.lastPlayerName,
    lastPoints: team.lastPoints,
  });

  const newScore = team.score + points;
  if (newScore === WIN_SCORE) {
    team.score = WIN_SCORE;
    team.winner = true;
  } else if (newScore > WIN_SCORE) {
    team.score = BUST_RESET_SCORE;
  } else {
    team.score = newScore;
  }

  team.lastPlayerName = currentPlayer ? currentPlayer.name : null;
  team.lastPoints = points;

  if (team.players.length) {
    team.currentPlayerIndex = (team.currentPlayerIndex + 1) % team.players.length;
  }

  saveMatch();
  render();
}

function undo(teamId) {
  const team = match.teams.find((t) => t.id === teamId);
  if (!team || !team.history.length) return;
  const prev = team.history.pop();
  team.score = prev.score;
  team.winner = prev.winner;
  team.currentPlayerIndex = prev.currentPlayerIndex;
  team.lastPlayerName = prev.lastPlayerName;
  team.lastPoints = prev.lastPoints;
  saveMatch();
  render();
}

function resetMatch() {
  if (!confirm('全チームのスコアをリセットしますか？')) return;
  match.teams.forEach((t) => {
    t.score = 0;
    t.history = [];
    t.winner = false;
    t.currentPlayerIndex = 0;
    t.lastPlayerName = null;
    t.lastPoints = null;
  });
  saveMatch();
  render();
}

function render() {
  if (!match) {
    broadcastArea.innerHTML = `
      <p class="overlay-empty">選択されたチームがありません。<br>管理画面でチームを2つ以上選択してください。</p>
    `;
    controlCards.innerHTML = '';
    return;
  }

  renderBroadcast();
  renderControls();
}

function renderBroadcast() {
  broadcastArea.innerHTML = '';
  match.teams.forEach((team) => {
    const currentPlayer = getCurrentPlayer(team);
    const currentPlayerName = currentPlayer ? escapeHtml(currentPlayer.name) : '-';
    const hasLastScore = team.lastPoints !== null;
    const lastScoreText = hasLastScore
      ? `${team.lastPlayerName ? escapeHtml(team.lastPlayerName) : '-'} +${team.lastPoints}点`
      : '';

    const panel = document.createElement('div');
    panel.className = `team-panel${team.winner ? ' team-panel--winner' : ''}`;
    panel.innerHTML = `
      <div class="team-panel__name">${escapeHtml(team.name)}</div>
      <div class="team-panel__score">${team.score}</div>
      <div class="team-panel__badge" ${team.winner ? '' : 'hidden'}>WIN!</div>
      <div class="team-panel__turn">現在のプレイヤー：${currentPlayerName}</div>
      <div class="team-panel__last-score" ${hasLastScore ? '' : 'hidden'}>${lastScoreText}</div>
    `;
    broadcastArea.appendChild(panel);
  });
}

function renderControls() {
  controlCards.innerHTML = '';
  const matchOver = hasWinner();

  match.teams.forEach((team) => {
    const card = document.createElement('article');
    card.className = 'control-card';

    const currentPlayer = getCurrentPlayer(team);
    const currentPlayerName = currentPlayer ? escapeHtml(currentPlayer.name) : '-';
    const hasLastScore = team.lastPoints !== null;
    const lastScoreText = hasLastScore
      ? `${team.lastPlayerName ? escapeHtml(team.lastPlayerName) : '-'} が ${team.lastPoints}点 獲得`
      : '';

    const playerNames = team.players.length
      ? team.players.map((p) => escapeHtml(p.name)).join('、')
      : '選手未登録';

    const pointButtons = Array.from({ length: MAX_POINTS - MIN_POINTS + 1 }, (_, i) => {
      const points = i + MIN_POINTS;
      return `<button type="button" class="point-btn" data-points="${points}">${points}</button>`;
    }).join('');

    card.innerHTML = `
      <div class="control-card__header">
        <strong>${escapeHtml(team.name)}</strong>
        <span class="control-card__score">${team.score} / ${WIN_SCORE}</span>
      </div>
      <p class="control-card__turn">現在のプレイヤー：<strong>${currentPlayerName}</strong></p>
      <p class="control-card__last" ${hasLastScore ? '' : 'hidden'}>${lastScoreText}</p>
      <p class="control-card__players">${playerNames}</p>
      <div class="point-grid">${pointButtons}</div>
      <div class="control-card__actions">
        <button type="button" class="secondary" data-action="undo">元に戻す</button>
      </div>
    `;

    if (matchOver) {
      card.querySelectorAll('.point-btn').forEach((btn) => {
        btn.disabled = true;
      });
    }

    card.querySelectorAll('.point-btn').forEach((btn) => {
      btn.addEventListener('click', () => addPoints(team.id, Number(btn.dataset.points)));
    });
    card.querySelector('[data-action="undo"]').addEventListener('click', () => undo(team.id));

    controlCards.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
