const MAX_TEAMS = 4;
const MAX_PLAYERS = 6;
const MIN_MATCH_TEAMS = 2;

const teams = [];
const selectedTeamIds = new Set();

let nextTeamId = 1;
let nextPlayerId = 1;

let teamNameInput;
let addTeamBtn;
let teamsGrid;
let matchStartBtn;

function bindElements() {
  teamNameInput = document.getElementById('team-name-input');
  addTeamBtn = document.getElementById('add-team-btn');
  teamsGrid = document.getElementById('teams-grid');
  matchStartBtn = document.getElementById('match-start-btn');

  return Boolean(teamNameInput && addTeamBtn && teamsGrid && matchStartBtn);
}

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

  teams.push({ id: nextTeamId++, name, players: [], collapsed: false });
  teamNameInput.value = '';
  refreshTeamsView();
}

function refreshTeamsView() {
  if (window.Dashboard) {
    window.Dashboard.refreshPanel('teams');
  } else {
    render();
  }
}

function deleteTeam(teamId) {
  if (!confirm('このチームを削除しますか？')) return;
  const idx = teams.findIndex((t) => t.id === teamId);
  if (idx === -1) return;
  teams.splice(idx, 1);
  selectedTeamIds.delete(teamId);
  if (teams.length === 0) {
    MolkkyMatch.endActiveMatch();
  }
  refreshTeamsView();
}

function toggleCollapse(teamId) {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  team.collapsed = !team.collapsed;
  refreshTeamsView();
}

function toggleTeamSelection(teamId) {
  if (selectedTeamIds.has(teamId)) {
    selectedTeamIds.delete(teamId);
  } else {
    selectedTeamIds.add(teamId);
  }
  refreshTeamsView();
}

function startMatch() {
  const selectedTeams = teams.filter((t) => selectedTeamIds.has(t.id));
  if (selectedTeams.length < MIN_MATCH_TEAMS) return;

  const payload = selectedTeams.map((t) => ({
    id: t.id,
    name: t.name,
    players: t.players.map((p) => ({ id: p.id, name: p.name })),
  }));

  MolkkyMatch.startNewMatch(payload);
  window.Dashboard.showPanel('score');
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
  refreshTeamsView();
}

function removePlayer(teamId, playerId) {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  team.players = team.players.filter((p) => p.id !== playerId);
  refreshTeamsView();
}

function renderTeams() {
  if (!teamsGrid) return;

  if (teams.length === 0) {
    teamsGrid.innerHTML = '<p class="teams-grid__empty"></p>';
    return;
  }

  teamsGrid.innerHTML = teams
    .map((team) => {
      const selected = selectedTeamIds.has(team.id);
      const collapsed = Boolean(team.collapsed);
      const players = Array.isArray(team.players) ? team.players : [];
      const count = players.length;
      const full = count >= MAX_PLAYERS;

      const playerRows = players
        .map(
          (player) => `
            <div class="player-row">
              <span class="player-row__name">${escapeHtml(player.name)}</span>
              <button type="button" class="player-row__remove" data-action="remove-player" data-player-id="${player.id}">削除</button>
            </div>
          `,
        )
        .join('');

      return `
        <article
          class="team-card${selected ? ' selected' : ''}${collapsed ? ' team-card--collapsed' : ''}"
          data-team-id="${team.id}"
          role="button"
          tabindex="0"
          aria-pressed="${selected}"
        >
          <div class="team-card__header">
            <button type="button" class="team-card__toggle" data-action="toggle-collapse" aria-expanded="${!collapsed}" aria-label="${collapsed ? '展開' : '折りたたむ'}">${collapsed ? '▸' : '▾'}</button>
            <strong>${escapeHtml(team.name)}</strong>
            <span class="team-card__count" data-full="${full}">${count}/${MAX_PLAYERS}</span>
            <button type="button" class="team-card__delete" data-action="delete-team" aria-label="チームを削除">×</button>
          </div>
          <div class="team-card__players">${playerRows}</div>
          <div class="team-card__add-player">
            <input type="text" placeholder="選手名" maxlength="30" ${full ? 'disabled' : ''}>
            <button type="button" data-action="add-player" ${full ? 'disabled' : ''}>追加</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderMatchStart() {
  if (!matchStartBtn) return;
  matchStartBtn.hidden = selectedTeamIds.size < MIN_MATCH_TEAMS;
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

function handleTeamsGridClick(event) {
  const actionEl = event.target.closest('[data-action]');
  const card = event.target.closest('.team-card');
  if (!card) return;

  const teamId = Number(card.dataset.teamId);
  if (!Number.isFinite(teamId)) return;

  if (actionEl) {
    const action = actionEl.dataset.action;

    if (action === 'toggle-collapse') {
      toggleCollapse(teamId);
      return;
    }

    if (action === 'delete-team') {
      deleteTeam(teamId);
      return;
    }

    if (action === 'remove-player') {
      removePlayer(teamId, Number(actionEl.dataset.playerId));
      return;
    }

    if (action === 'add-player') {
      const input = card.querySelector('.team-card__add-player input');
      if (input) addPlayer(teamId, input);
      return;
    }

    return;
  }

  if (event.target.closest('input')) return;
  toggleTeamSelection(teamId);
}

function handleTeamsGridKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const card = event.target.closest('.team-card');
  if (!card || event.target.closest('button, input')) return;

  event.preventDefault();
  toggleTeamSelection(Number(card.dataset.teamId));
}

function handleTeamsGridKeydownInput(event) {
  if (event.key !== 'Enter') return;
  const card = event.target.closest('.team-card');
  if (!card) return;
  addPlayer(Number(card.dataset.teamId), event.target);
}

function initTeamsPage() {
  if (!bindElements()) {
    console.error('Team management elements not found.');
    return;
  }

  addTeamBtn.addEventListener('click', addTeam);
  teamNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addTeam();
  });
  matchStartBtn.addEventListener('click', startMatch);
  teamsGrid.addEventListener('click', handleTeamsGridClick);
  teamsGrid.addEventListener('keydown', handleTeamsGridKeydown);
  teamsGrid.addEventListener('keydown', handleTeamsGridKeydownInput);
}

window.TeamsPage = { render };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTeamsPage);
} else {
  initTeamsPage();
}
