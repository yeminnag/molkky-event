const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');

clearHistoryBtn.addEventListener('click', () => {
  if (!confirm('過去の試合をすべて削除しますか？')) return;
  MolkkyMatch.clearPastMatches();
  render();
});

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status) {
  if (status === 'finished') return '終了';
  if (status === 'abandoned') return '中断';
  return status;
}

function render() {
  const entries = MolkkyMatch.getPastMatches();
  historyList.innerHTML = '';

  if (!entries.length) {
    historyEmpty.hidden = false;
    clearHistoryBtn.hidden = true;
    return;
  }

  historyEmpty.hidden = true;
  clearHistoryBtn.hidden = false;

  entries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'history-card';

    const teamsHtml = entry.teams
      .map((team) => {
        const tags = [];
        if (team.winner) tags.push('WIN');
        if (team.eliminated) tags.push('OUT');
        const tagHtml = tags.length
          ? `<span class="history-team__tags">${tags.map((t) => `<span class="history-tag">${t}</span>`).join('')}</span>`
          : '';

        return `
          <li class="history-team${team.winner ? ' history-team--winner' : ''}${team.eliminated ? ' history-team--out' : ''}">
            <span class="history-team__name">${escapeHtml(team.name)}</span>
            <span class="history-team__score">${team.score}</span>
            ${tagHtml}
          </li>
        `;
      })
      .join('');

    card.innerHTML = `
      <div class="history-card__header">
        <div>
          <time class="history-card__date">${formatDate(entry.finishedAt)}</time>
          <span class="history-card__status history-card__status--${entry.status}">${statusLabel(entry.status)}</span>
        </div>
        <button type="button" class="secondary history-card__delete" data-id="${entry.id}">削除</button>
      </div>
      ${entry.winnerName ? `<p class="history-card__winner">勝者: ${escapeHtml(entry.winnerName)}</p>` : ''}
      <ul class="history-card__teams">${teamsHtml}</ul>
    `;

    card.querySelector('.history-card__delete').addEventListener('click', () => {
      MolkkyMatch.deletePastMatch(entry.id);
      render();
    });

    historyList.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.HistoryPage = { render };

MolkkyMatch.subscribe(() => {
  render();
});
