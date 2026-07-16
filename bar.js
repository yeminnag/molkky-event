// Entry point for overlay-bar.html — the team scorebug OBS source.
// Positioning is done in OBS, so this page only owns the panels.
// reveal.js drives the compact <-> full animation on top of this.

const barPanels = document.getElementById('team-panels');

function renderBar() {
  renderTeamPanels(
    barPanels,
    MolkkyMatch.get(),
    'まもなく試合を開始します。<br>少々お待ちください。',
  );
}

MolkkyMatch.subscribe(renderBar);
renderBar();
