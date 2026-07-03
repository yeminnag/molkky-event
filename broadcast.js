const teamPanels = document.getElementById('team-panels');

function render() {
  renderTeamPanels(
    teamPanels,
    MolkkyMatch.get(),
    '試合データがありません。<br>ダッシュボードで試合を開始してください。',
  );
}

MolkkyMatch.subscribe(render);
render();
