const MAX_TEAMS = 4;
const MAX_PLAYERS = 6;
const MIN_MATCH_TEAMS = 2;
const MATCH_TEAMS_STORAGE_KEY = 'molkkyMatchTeams';

const teams = [];
const selectedTeamIds = new Set();

let nextTeamId = 1;
let nextPlayerId = 1;

const teamNameInput = document.getElementById('team-name-input');
const addTeamBtn = document.getElementById('add-team-btn');
const teamsGrid = document.getElementById('teams-grid');
const matchStartBtn = document.getElementById('match-start-btn');
const matchStartCount = document.getElementById('match-start-count');

addTeamBtn.addEventListener('click', addTeam);
teamNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTeam();
});
matchStartBtn.addEventListener('click', startMatch);

function addTeam() {
  const name = teamNameInput.value.trim();
  if (!name) {
    teamNameInput.focus();
    return;
  }
  if (teams.length >= MAX_TEAMS) {
    alert(`チームは最大 ${MAX_TEAMS} つまでです。`);
    return;
  }
  if (teams.some((t) => t.name === name)) {
    alert('同じ名前のチームがあります。');
    return;
  }

  teams.push({ id: nextTeamId++, name, players: [] });
  teamNameInput.value = '';
  render();
}

function deleteTeam(teamId) {
  if (!confirm('このチームを削除しますか？')) return;
  const idx = teams.findIndex((t) => t.id === teamId);
  if (idx === -1) return;
  teams.splice(idx, 1);
  selectedTeamIds.delete(teamId);
  render();
}

function toggleTeamSelection(teamId) {
  if (selectedTeamIds.has(teamId)) {
    selectedTeamIds.delete(teamId);
  } else {
    selectedTeamIds.add(teamId);
  }
  render();
}

function startMatch() {
  const selectedTeams = teams.filter((t) => selectedTeamIds.has(t.id));
  if (selectedTeams.length < MIN_MATCH_TEAMS) return;

  const payload = selectedTeams.map((t) => ({
    id: t.id,
    name: t.name,
    players: t.players.map((p) => ({ id: p.id, name: p.name })),
  }));
  localStorage.setItem(MATCH_TEAMS_STORAGE_KEY, JSON.stringify(payload));
  window.location.href = 'overlay.html';
}

function addPlayer(teamId, input) {
  const name = input.value.trim();
  if (!name) return;

  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  if (team.players.length >= MAX_PLAYERS) {
    alert(`1チーム最大 ${MAX_PLAYERS} 名までです。`);
    return;
  }

  team.players.push({ id: nextPlayerId++, name });
  input.value = '';
  render();
}

function removePlayer(teamId, playerId) {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  team.players = team.players.filter((p) => p.id !== playerId);
  render();
}

function renderTeams() {
  teamsGrid.innerHTML = '';

  teams.forEach((team) => {
    const selected = selectedTeamIds.has(team.id);

    const card = document.createElement('article');
    card.className = `team-card${selected ? ' selected' : ''}`;
    card.dataset.teamId = String(team.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', String(selected));

    const count = team.players.length;
    const full = count >= MAX_PLAYERS;

    card.innerHTML = `
      <div class="team-card__header">
        <strong>${escapeHtml(team.name)}</strong>
        <span class="team-card__count" data-full="${full}">${count}/${MAX_PLAYERS}</span>
        <button type="button" class="team-card__delete" data-action="delete-team" aria-label="チームを削除">×</button>
      </div>
      <div class="team-card__players"></div>
      <div class="team-card__add-player">
        <input type="text" placeholder="選手名" maxlength="30">
        <button type="button">＋ 追加</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input')) return;
      toggleTeamSelection(team.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.target.closest('button, input')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTeamSelection(team.id);
      }
    });

    card.querySelector('[data-action="delete-team"]').addEventListener('click', () => deleteTeam(team.id));

    const playersEl = card.querySelector('.team-card__players');
    team.players.forEach((player) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <span class="player-row__name">${escapeHtml(player.name)}</span>
        <button type="button" class="player-row__remove">削除</button>
      `;
      row.querySelector('button').addEventListener('click', () => removePlayer(team.id, player.id));
      playersEl.appendChild(row);
    });

    const playerInput = card.querySelector('.team-card__add-player input');
    const addPlayerBtn = card.querySelector('.team-card__add-player button');
    addPlayerBtn.addEventListener('click', () => addPlayer(team.id, playerInput));
    playerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addPlayer(team.id, playerInput);
    });

    if (full) {
      playerInput.disabled = true;
      addPlayerBtn.disabled = true;
    }

    teamsGrid.appendChild(card);
  });
}

function renderMatchStart() {
  const count = selectedTeamIds.size;
  matchStartCount.textContent = String(count);
  matchStartBtn.hidden = count < MIN_MATCH_TEAMS;
}

function render() {
  renderTeams();
  renderMatchStart();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

render();
