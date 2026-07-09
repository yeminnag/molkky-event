const teamPanels = document.getElementById('team-panels');
const scoresheet = document.getElementById('scoresheet');

function render() {
  const match = MolkkyMatch.get();
  renderTeamPanels(
    teamPanels,
    match,
    'まもなく試合を開始します。<br>少々お待ちください。',
  );
  renderScoreSheet(scoresheet, match, { windowed: true, maxRounds: 6 });
}

MolkkyMatch.subscribe(render);
render();
