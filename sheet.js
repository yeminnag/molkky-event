// Entry point for overlay-sheet.html — the score sheet OBS source.
// reveal.js drives the roll-away/drop-in animation on top of this.

const sheetTable = document.getElementById('scoresheet');

function renderSheet() {
  renderScoreSheet(sheetTable, MolkkyMatch.get(), { windowed: true, maxRounds: 6 });
}

MolkkyMatch.subscribe(renderSheet);
renderSheet();
