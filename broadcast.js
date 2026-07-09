const teamPanels = document.getElementById('team-panels');

function render() {
  renderTeamPanels(
    teamPanels,
    MolkkyMatch.get(),
    'まもなく試合を開始します。<br>少々お待ちください。',
  );
}

MolkkyMatch.subscribe(render);
render();
