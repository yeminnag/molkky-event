// Pre-match standby scene for overlay.html.
//
// The overlay shows the designed "starting soon" card whenever there is no
// active match, and swaps to the live scorebug / scoresheet as soon as a match
// exists. Match state arrives over BroadcastChannel (via MolkkyMatch), the same
// passive-mirror approach the other overlay scripts use, so this simply reacts
// to whether MolkkyMatch has a match at all.
function syncStandby(state) {
  document.body.classList.toggle('is-standby', !state);
}

MolkkyMatch.subscribe(syncStandby);
syncStandby(MolkkyMatch.get());
