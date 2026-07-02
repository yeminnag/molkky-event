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
      return JSON.parse(savedState);
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

  return {
    teams: selectedTeams.map((t) => ({
      id: t.id,
      name: t.name,
      players: t.players || [],
      score: 0,
      history: [],
      winner: false,
    })),
  };
}

function saveMatch() {
  localStorage.setItem(MATCH_STATE_STORAGE_KEY, JSON.stringify(match));
}

function hasWinner() {
  return match.teams.some((t) => t.winner);
}

function addPoints(teamId, points) {
  const team = match.teams.find((t) => t.id === teamId);
  if (!team || hasWinner()) return;

  team.history.push(team.score);
  const newScore = team.score + points;

  if (newScore === WIN_SCORE) {
    team.score = WIN_SCORE;
    team.winner = true;
  } else if (newScore > WIN_SCORE) {
    team.score = BUST_RESET_SCORE;
  } else {
    team.score = newScore;
  }

  saveMatch();
  render();
}

function undo(teamId) {
  const team = match.teams.find((t) => t.id === teamId);
  if (!team || !team.history.length) return;
  team.score = team.history.pop();
  team.winner = false;
  saveMatch();
  render();
}

function resetMatch() {
  if (!confirm('全チームのスコアをリセットしますか？')) return;
  match.teams.forEach((t) => {
    t.score = 0;
    t.history = [];
    t.winner = false;
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
    const panel = document.createElement('div');
    panel.className = `team-panel${team.winner ? ' team-panel--winner' : ''}`;
    panel.innerHTML = `
      <div class="team-panel__name">${escapeHtml(team.name)}</div>
      <div class="team-panel__score">${team.score}</div>
      <div class="team-panel__badge" ${team.winner ? '' : 'hidden'}>WIN!</div>
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
