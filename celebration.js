// Full-screen win celebration — overlay-win.html.
//
// This is its own OBS source precisely because it is full-screen: bundling it
// with the scorebug or the sheet would crop the burst to that source's frame.
//
// The overlay is a passive mirror: its state arrives over BroadcastChannel,
// which replays match state but NOT the game events emitted in the admin tab.
// So the win is detected by diffing the winner across renders (same approach as
// team-panels.js) rather than by listening on MolkkyMatch.onEvent.

const winFx = document.getElementById('win-fx');
const winFxTeam = document.getElementById('win-fx-team');
const winFxScore = document.getElementById('win-fx-score');
const winFxConfetti = document.getElementById('win-fx-confetti');

// Must outlast the longest keyframe animation in celebration.css (5.6s).
const WIN_FX_DURATION = 5800;
const WIN_FX_CONFETTI_COUNT = 80;
// Warm hues only: a chroma key on green would swallow green confetti mid-fall.
const WIN_FX_COLORS = ['#c3922f', '#f4ecd8', '#e8d9b8', '#d9c399', '#c33c2e', '#6f4f2c'];

// id of the winner already celebrated, so a plain re-render (turn change,
// scoresheet update) never replays the burst. Cleared when the winner goes
// away via undo / reset / new match, which re-arms the next win.
let winFxShownFor = null;
let winFxHideTimer = null;
let winFxFirstSync = true;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function buildWinConfetti() {
  winFxConfetti.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < WIN_FX_CONFETTI_COUNT; i += 1) {
    const piece = document.createElement('i');
    piece.className = 'win-fx__piece';
    const width = randomBetween(5, 12);
    const round = Math.random() < 0.3;

    piece.style.setProperty('--x', `${randomBetween(-5, 105)}vw`);
    piece.style.setProperty('--w', `${width}px`);
    piece.style.setProperty('--h', `${round ? width : randomBetween(9, 20)}px`);
    piece.style.setProperty('--r', round ? '50%' : '1px');
    piece.style.setProperty('--c', WIN_FX_COLORS[i % WIN_FX_COLORS.length]);
    piece.style.setProperty('--drift', `${randomBetween(-18, 18)}vw`);
    piece.style.setProperty('--spin', `${randomBetween(-900, 900)}deg`);
    piece.style.setProperty('--dur', `${randomBetween(2.6, 4.6)}s`);
    piece.style.setProperty('--delay', `${randomBetween(0, 1.4)}s`);

    fragment.appendChild(piece);
  }

  winFxConfetti.appendChild(fragment);
}

function hideWinFx() {
  clearTimeout(winFxHideTimer);
  winFx.classList.remove('is-active');
  winFxConfetti.innerHTML = '';
}

function showWinFx(team) {
  clearTimeout(winFxHideTimer);

  winFxTeam.textContent = team.name;
  winFxScore.textContent = `${team.score} POINTS`;
  buildWinConfetti();

  // Drop the class and force a reflow first, so re-winning after an undo
  // restarts the keyframes instead of leaving them at their finished state.
  winFx.classList.remove('is-active');
  void winFx.offsetWidth;
  winFx.classList.add('is-active');

  winFxHideTimer = setTimeout(hideWinFx, WIN_FX_DURATION);
}

function syncWinFx(state) {
  const winner = state?.teams.find((t) => t.winner) ?? null;

  if (!winner) {
    winFxShownFor = null;
    hideWinFx();
    return;
  }

  if (winner.id === winFxShownFor) return;
  winFxShownFor = winner.id;

  // A reload of an already-decided match (OBS restarting the browser source)
  // should show the standing result, not replay the celebration.
  if (winFxFirstSync) return;
  showWinFx(winner);
}

MolkkyMatch.subscribe(syncWinFx);
syncWinFx(MolkkyMatch.get());
winFxFirstSync = false;
