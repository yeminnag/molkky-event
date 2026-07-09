const tabs = document.querySelectorAll('.dashboard-tab[data-panel]');
const panels = document.querySelectorAll('.dashboard-panel');

let activePanel = 'teams';

function renderPanel(panelName) {
  if (panelName === 'teams' && window.TeamsPage) {
    window.TeamsPage.render();
  }
  if (panelName === 'score' && window.ScorePage) {
    window.ScorePage.render();
  }
  if (panelName === 'records' && window.RecordsPage) {
    window.RecordsPage.render();
  }
  if (panelName === 'history' && window.HistoryPage) {
    window.HistoryPage.render();
  }
}

function showPanel(panelName) {
  activePanel = panelName;

  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.panel === panelName);
  });

  panels.forEach((panel) => {
    const active = panel.dataset.panel === panelName;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });

  history.replaceState(null, '', `#${panelName}`);

  requestAnimationFrame(() => {
    renderPanel(panelName);
  });
}

function refreshPanel(panelName) {
  const panel = document.querySelector(`.dashboard-panel[data-panel="${panelName}"]`);
  if (!panel || activePanel !== panelName || panel.hidden) {
    showPanel(panelName);
    return;
  }

  requestAnimationFrame(() => {
    renderPanel(panelName);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => showPanel(tab.dataset.panel));
});

document.querySelectorAll('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => showPanel(btn.dataset.goto));
});

window.addEventListener('hashchange', () => {
  const panelName = window.location.hash.replace('#', '');
  if (['teams', 'score', 'records', 'history'].includes(panelName)) {
    showPanel(panelName);
  }
});

const VALID_PANELS = ['teams', 'score', 'records', 'history'];
const initialPanel = window.location.hash.replace('#', '') || 'teams';
showPanel(VALID_PANELS.includes(initialPanel) ? initialPanel : 'teams');

window.Dashboard = { showPanel, refreshPanel, getActivePanel: () => activePanel };
