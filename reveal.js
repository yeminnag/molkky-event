// Broadcast reveal for the OBS overlay.
//
// The overlay rests in a compact scorebug (team name + score only, scoresheet
// rolled away) so the footage stays readable, and opens up to the full panels +
// scoresheet for a few seconds whenever a throw lands.
//
// Like celebration.js, this cannot use MolkkyMatch.onEvent: the overlay's state
// arrives over BroadcastChannel, which replays match state but not the events
// emitted in the admin tab. So a throw is detected by diffing a signature of
// the things a throw changes. Reordering a team's rotation (movePlayer) also
// notifies, but leaves the signature identical, so it correctly stays quiet.

// How long the full overlay stays up after a throw.
const REVEAL_MS = 8000;

let revealTimer = null;
let revealSignature = null;

function throwSignature(state) {
  if (!state) return null;
  const teams = state.teams
    .map((t) => `${t.id}:${t.score}:${t.consecutiveMisses}:${t.eliminated ? 1 : 0}:${t.winner ? 1 : 0}`)
    .join(',');
  return `${state.actionLog.length}|${teams}`;
}

function collapseOverlay() {
  clearTimeout(revealTimer);
  revealTimer = null;
  document.body.classList.remove('is-revealed');
}

// sticky: stay open indefinitely instead of rolling back up.
function revealOverlay(sticky) {
  clearTimeout(revealTimer);
  revealTimer = null;

  if (!document.body.classList.contains('is-revealed')) {
    // The panels were just rebuilt by renderTeamPanels. Resolve their compact
    // styles before flipping the class, otherwise the browser has no "from"
    // state and the reveal snaps instead of animating.
    void document.body.offsetWidth;
    document.body.classList.add('is-revealed');
  }

  if (!sticky) revealTimer = setTimeout(collapseOverlay, REVEAL_MS);
}

function syncReveal(state) {
  const signature = throwSignature(state);
  // A null previous signature means this is the first sync (page load), which
  // should settle into the compact rest state rather than fire a reveal.
  const changed = revealSignature !== null && signature !== null && signature !== revealSignature;
  revealSignature = signature;

  if (!state) {
    collapseOverlay();
    return;
  }

  // Once the match is decided, leave the final scoresheet up for good.
  if (MolkkyMatch.hasWinner()) {
    revealOverlay(true);
    return;
  }

  if (changed) revealOverlay(false);
}

MolkkyMatch.subscribe(syncReveal);
syncReveal(MolkkyMatch.get());
