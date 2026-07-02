const MAX_TEAMS = 4;
const MAX_PLAYERS = 6;

const teams = [];

let nextTeamId = 1;
let nextPlayerId = 1;

const teamNameInput = document.getElementById('team-name-input');
const addTeamBtn = document.getElementById('add-team-btn');
const teamsGrid = document.getElementById('teams-grid');

addTeamBtn.addEventListener('click', addTeam);
teamNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTeam();
});

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
  render();
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
    const card = document.createElement('article');
    card.className = 'team-card';
    card.dataset.teamId = String(team.id);

    const count = team.players.length;
    const full = count >= MAX_PLAYERS;

    card.innerHTML = `
      <div class="team-card__header">
        <strong>${escapeHtml(team.name)}</strong>
        <span class="team-card__count" data-full="${full}">${count}/${MAX_PLAYERS}</span>
        <button type="button" class="secondary" data-action="delete-team">削除</button>
      </div>
      <div class="team-card__players"></div>
      <div class="team-card__add-player">
        <input type="text" placeholder="選手名" maxlength="30">
        <button type="button">＋ 追加</button>
      </div>
    `;

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

function render() {
  renderTeams();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

render();
