function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Remembers each team's last-rendered score/winner state so we can tell, on the
// next full rebuild, whether the score just rose or the team just won — and
// trigger the "stir up" celebration only on those transitions (not on every
// unrelated re-render such as a turn change).
const prevTeamState = new Map();

function renderTeamPanels(container, match, emptyMessage) {
  if (!container) return;

  container.innerHTML = '';

  if (!match) {
    prevTeamState.clear();
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

    const prev = prevTeamState.get(team.id);
    const scoreRose = prev != null && team.score > prev.score;
    const justWon = team.winner && (prev == null || !prev.winner);

    const panel = document.createElement('div');
    panel.className = `team-panel${team.winner ? ' team-panel--winner' : ''}${team.eliminated ? ' team-panel--out' : ''}${isActive ? ' team-panel--active' : ''}`;
    panel.innerHTML = `
      <div class="team-panel__name">${escapeHtml(team.name)}</div>
      ${isActive ? `<div class="team-panel__player"><span class="team-panel__player-label">今の選手</span>${playerName}</div>` : ''}
      <div class="team-panel__score">${team.score}</div>
      ${team.eliminated ? '<div class="team-panel__badge team-panel__badge--out">OUT</div>' : `<div class="team-panel__badge" ${team.winner ? '' : 'hidden'}>WIN!</div>`}
      ${!team.eliminated && !team.winner ? `<div class="team-panel__misses">ミス ${team.consecutiveMisses}/${MolkkyMatch.MAX_CONSECUTIVE_MISSES}</div>` : ''}
    `;

    // Stir-up celebrations: whole-panel burst on a win, a punchy lift on the
    // score when points are added. The element is freshly built each render, so
    // simply having the class present plays the keyframes once.
    if (justWon) {
      panel.classList.add('team-panel--celebrate');
    }
    if (scoreRose) {
      panel.querySelector('.team-panel__score')?.classList.add('team-panel__score--stir');
    }

    container.appendChild(panel);
    prevTeamState.set(team.id, { score: team.score, winner: team.winner });
  });
}
