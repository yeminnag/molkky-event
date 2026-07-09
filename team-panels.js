function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderTeamPanels(container, match, emptyMessage) {
  if (!container) return;

  container.innerHTML = '';

  if (!match) {
    if (emptyMessage) {
      const empty = document.createElement('p');
      empty.className = 'overlay-empty';
      empty.innerHTML = emptyMessage;
      container.appendChild(empty);
    }
    return;
  }

  const currentTeam = MolkkyMatch.getCurrentTeam();

  match.teams.forEach((team) => {
    const isActive = currentTeam && team.id === currentTeam.id && !MolkkyMatch.hasWinner();
    const currentPlayer = isActive ? MolkkyMatch.getCurrentPlayer(team) : null;
    const playerName = currentPlayer
      ? escapeHtml(currentPlayer.name)
      : isActive
        ? '選手未登録'
        : '';

    const panel = document.createElement('div');
    panel.className = `team-panel${team.winner ? ' team-panel--winner' : ''}${team.eliminated ? ' team-panel--out' : ''}${isActive ? ' team-panel--active' : ''}`;
    panel.innerHTML = `
      <div class="team-panel__name">${escapeHtml(team.name)}</div>
      ${isActive ? `<div class="team-panel__player"><span class="team-panel__player-label">今の選手</span>${playerName}</div>` : ''}
      <div class="team-panel__score">${team.score}</div>
      ${team.eliminated ? '<div class="team-panel__badge team-panel__badge--out">OUT</div>' : `<div class="team-panel__badge" ${team.winner ? '' : 'hidden'}>WIN!</div>`}
      ${!team.eliminated && !team.winner ? `<div class="team-panel__misses">ミス ${team.consecutiveMisses}/${MolkkyMatch.MAX_CONSECUTIVE_MISSES}</div>` : ''}
    `;
    container.appendChild(panel);
  });
}
