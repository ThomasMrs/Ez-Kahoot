async function readAsset(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('Les fichiers du compagnon ne sont pas disponibles. Relance Ez-Kahoot.');
  return response.text();
}

export async function buildConsoleScript(quiz) {
  if (!quiz?.questions?.length) throw new Error('Charge un quiz avant de créer son script.');
  const [matching, automation, activeChoice, panel, reader] = await Promise.all([
    readAsset('/shared/matching.js'), readAsset('/shared/automation.js'), readAsset('/shared/active-choice.js'),
    readAsset('/shared/live-panel.js'), readAsset('/shared/reader.js')
  ]);
  const classic = source => {
    const result = source.replace(/^import[^\n]*\n/gm, '').replace(/\bexport\s+(?=(?:function|const|let|class)\b)/g, '');
    if (/^\s*(?:import|export)\s/m.test(result)) throw new Error('Le compagnon doit être mis à jour.');
    return result;
  };
  return `/* Ez-Kahoot 1.4 · thomas marsa
 * Corrigé embarqué, aucun appel réseau et aucun code de connexion.
 * Auto-clic facultatif : question exacte et choix visibles vérifiés.
 * Fermer le panneau arrête toute lecture et tout clic.
 */
(() => {
  'use strict';
  if (location.protocol !== 'https:' || !['kahoot.it','create.kahoot.it','play.kahoot.it'].includes(location.hostname)) {
    console.info('Ez-Kahoot : ouvre ton onglet Kahoot.'); return;
  }
  const quiz = ${JSON.stringify(quiz)};
  ${[matching, automation, activeChoice, panel].map(classic).join('\n')}
  const readPage = () => (${reader.trim().replace(/;\s*$/, '')});
  const previous = document.getElementById('ez-kahoot-pocket-panel');
  if (previous) { previous.dispatchEvent(new Event('ez-pocket-dispose')); previous.remove(); }
  mountLivePanel({quiz,readPage,decideAnswer,activateAnswer:(capture,index)=>activateAnswer(capture,index,readPage)});
})();
`;
}

export async function copyConsoleScript(quiz) {
  const script = await buildConsoleScript(quiz);
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(script); return; } catch { /* Try the explicit local fallback. */ }
  }
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = script;
  field.setAttribute('aria-label', 'Script de poche à copier');
  field.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(field); field.select();
  const copied = document.execCommand('copy'); field.remove(); previous?.focus();
  if (!copied) throw new Error('Copie indisponible. Télécharge le fichier JavaScript.');
}

export async function downloadConsoleScript(quiz) {
  const script = await buildConsoleScript(quiz);
  const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ez-kahoot-script-de-poche.js';
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
