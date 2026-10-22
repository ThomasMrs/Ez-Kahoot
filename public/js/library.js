import { readLibrary, deleteQuiz, escapeHtml } from './data.js';
import { exportQuiz } from './exports.js';

const folderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/></svg>';
const arrowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';

export function renderLibrary(container, ctx) {
  let query = '';
  container.innerHTML = `<div class="library-view"><div class="lib-heading"><div><p class="lib-eyebrow">TON ESPACE PERSONNEL</p><h1>Ta bibliothèque.</h1><p class="muted">Tes quiz sauvegardés, prêts à retrouver.</p></div>
    <label class="lib-search"><span class="sr-only">Chercher dans la bibliothèque</span><input type="search" placeholder="Rechercher un quiz…" autocomplete="off"></label></div>
    <p class="lib-storage-note">Les quiz sont conservés dans ce navigateur, sur cet appareil. Jusqu’à 24 quiz récents ; exporte un JSON pour garder une copie.</p><div class="lib-grid" aria-live="polite"></div></div>`;
  const grid = container.querySelector('.lib-grid');

  function draw() {
    const all = readLibrary();
    const quizzes = all.filter(quiz => `${quiz.title} ${quiz.description || ''}`.toLocaleLowerCase('fr').includes(query));
    if (!quizzes.length) {
      grid.innerHTML = `<div class="lib-empty">${folderIcon}<h2>${all.length ? 'Aucun quiz ne correspond.' : 'Une place pour tes prochains quiz.'}</h2>
        <p>${all.length ? 'Essaie avec un autre mot.' : 'Charge un quiz dans l’explorateur, puis sauvegarde-le ici.'}</p><button class="btn btn-primary" data-explore>Ouvrir l’explorateur ${arrowIcon}</button></div>`;
      grid.querySelector('[data-explore]').onclick = () => ctx.navigate('explorer');
      return;
    }
    grid.innerHTML = quizzes.map((quiz, index) => {
      const date = new Date(quiz.savedAt || quiz.loadedAt);
      const formatted = Number.isNaN(date.getTime()) ? 'Sauvegardé localement' : `Sauvegardé le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
      return `<article class="lib-card"><div class="lib-card-art lib-art-${index % 4}" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="lib-card-body"><div class="lib-card-meta"><span>${quiz.questions.length} questions</span><span>${escapeHtml(formatted)}</span></div>
        <h2>${escapeHtml(quiz.title)}</h2><p>${escapeHtml(quiz.description || 'Un quiz prêt pour ta prochaine session.')}</p>
        <div class="lib-card-actions"><button class="btn btn-primary" data-open="${index}">Ouvrir ${arrowIcon}</button><button class="btn btn-ghost" data-export="${index}" aria-label="Exporter ${escapeHtml(quiz.title)} en JSON">JSON</button><button class="btn btn-ghost lib-delete" data-delete="${index}" aria-label="Supprimer ${escapeHtml(quiz.title)} de la bibliothèque">Supprimer</button></div></div></article>`;
    }).join('');
    grid.querySelectorAll('[data-open]').forEach(button => button.onclick = async () => {
      await ctx.setQuiz(quizzes[Number(button.dataset.open)]);
      ctx.navigate('explorer');
    });
    grid.querySelectorAll('[data-export]').forEach(button => button.onclick = () => {
      try { exportQuiz(quizzes[Number(button.dataset.export)], 'json'); ctx.toast('Copie JSON téléchargée.'); }
      catch (error) { ctx.toast(error.message, 'error'); }
    });
    grid.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => {
      const quiz = quizzes[Number(button.dataset.delete)];
      if (deleteQuiz(quiz.id)) { draw(); ctx.toast('Quiz retiré de la bibliothèque.'); }
      else ctx.toast('Impossible de modifier le stockage du navigateur.', 'error');
    });
  }
  container.querySelector('input').oninput = event => {
    query = event.target.value.toLocaleLowerCase('fr').trim();
    draw();
  };
  draw();
}
