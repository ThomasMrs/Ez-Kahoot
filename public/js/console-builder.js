async function readAsset(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('Les fichiers du compagnon ne sont pas disponibles. Relance Ez-Kahoot.');
  return response.text();
}

export async function buildConsoleScript(quiz) {
  if (!quiz?.questions?.length) throw new Error('Charge un quiz avant de créer son script.');
  const [matching, reader] = await Promise.all([
    readAsset('/shared/matching.js'), readAsset('/shared/reader.js')
  ]);
  const functions = matching.replace(/\bexport\s+(?=(?:function|const|let|class)\b)/g, '');
  if (/^\s*(?:import|export)\s/m.test(functions)) {
    throw new Error('Le moteur de recherche doit être mis à jour avant de générer ce script.');
  }
  const expression = reader.trim().replace(/;\s*$/, '');
  return `/* Ez-Kahoot 1.1 · thomas marsa
 * Corrigé du quiz embarqué. Lecture du texte visible uniquement.
 * Aucun appel réseau, cookie, clé API ou code de connexion.
 * Fermer le panneau arrête aussi le suivi facultatif.
 */
(() => {
  'use strict';
  if (!['kahoot.it','www.kahoot.it','create.kahoot.it','play.kahoot.it'].includes(location.hostname)) {
    console.info('Ez-Kahoot : ouvre ton onglet Kahoot avant d’exécuter ce script.');
    return;
  }
  const quiz = ${JSON.stringify(quiz)};
  ${functions}
  const readPage = () => (${expression});
  const previous = document.getElementById('ez-kahoot-pocket-panel');
  if (previous) { previous.dispatchEvent(new Event('ez-pocket-dispose')); previous.remove(); }
  const host = document.createElement('div');
  host.id = 'ez-kahoot-pocket-panel';
  host.style.cssText = 'position:fixed;right:16px;top:16px;width:min(370px,calc(100vw - 32px));z-index:2147483646;color-scheme:light;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial;font:13px/1.5 system-ui,sans-serif;color:#202820}*{box-sizing:border-box}.panel{background:#fffef9;border:1px solid #d6dccf;border-radius:14px;box-shadow:0 12px 48px #0003;max-height:calc(100vh - 32px);overflow:auto}header{padding:16px 18px;background:#202820;color:#fffef9;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0}h2{font-size:16px;margin:0}button,input{font:inherit}button{cursor:pointer;border:1px solid #c9d2c1;background:#f3f5ec;color:#283522;border-radius:7px;padding:8px 11px;min-height:36px}button:focus-visible,input:focus-visible{outline:3px solid #bc4427;outline-offset:3px}.close{background:transparent;border-color:#718167;color:#fff;font-size:18px;padding:0;width:32px}.body{padding:16px 18px}.quiz{font-weight:650;margin:0 0 12px;overflow-wrap:anywhere}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}label{display:flex;align-items:center;gap:6px;color:#4f5f44;font-size:12px}input[type=checkbox]{accent-color:#394e2e}input[type=search]{border:1px solid #c9d2c1;border-radius:7px;padding:9px 10px;width:100%;margin:12px 0;background:white;color:#202820}.status{font-size:12px;color:#5e6a54;margin:12px 0;overflow-wrap:anywhere}.card{padding:12px;border:1px solid #d6dccf;border-radius:9px;margin:10px 0}.tag{font-size:10px;letter-spacing:.04em;color:#435d34;margin:0 0 7px}.question{font-size:12px;font-weight:600;margin:0 0 9px;overflow-wrap:anywhere}.answer{background:#e8f0df;color:#24431b;padding:9px;border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.unknown{color:#884429}.ambiguous{background:#fff0cf;color:#6f4a0e;padding:10px;border-radius:7px;font-size:12px}footer{border-top:1px solid #e1e4d9;color:#5c6653;font-size:10px;padding:12px 18px}.hidden{display:none}';
  shadow.append(style);
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  const panel = node('section', 'panel'); panel.setAttribute('aria-label','Compagnon Ez-Kahoot');
  const header = node('header'); header.append(node('h2','','Ez-Kahoot · script de poche'));
  const close = node('button','close','×'); close.type='button'; close.setAttribute('aria-label','Fermer le compagnon'); header.append(close);
  const body = node('div','body'); body.append(node('p','quiz',quiz.title));
  const actions = node('div','actions'); const reread = node('button','','Relire la question'); reread.type='button';
  const autoLabel = node('label'); const auto = document.createElement('input'); auto.type='checkbox'; autoLabel.append(auto,document.createTextNode('Suivi auto'));
  actions.append(reread,autoLabel); body.append(actions);
  const manual = document.createElement('input'); manual.type='search'; manual.placeholder='Ou colle une question…'; manual.setAttribute('aria-label','Question à retrouver manuellement'); body.append(manual);
  const status = node('p','status'); status.setAttribute('role','status'); body.append(status);
  const results = node('div'); body.append(results);
  const footer = node('footer','','Quiz embarqué · correspondances locales · thomas marsa');
  panel.append(header,body,footer); shadow.append(panel); document.documentElement.append(host);
  let interval = null;
  let lastText = '';
  const dispose = () => { if (interval !== null) clearInterval(interval); interval=null; host.remove(); };
  close.addEventListener('click',dispose);
  host.addEventListener('ez-pocket-dispose',dispose,{once:true});
  function renderQuestion(force=false) {
    let capture;
    try { capture=readPage(); } catch { capture={}; }
    const text = manual.value.trim() || String(capture?.question || '').trim();
    if (!force && normalizeText(text) === lastText) return;
    lastText = normalizeText(text);
    results.replaceChildren();
    if (!text) { status.textContent='Question non lisible sur cette page. Colle son texte dans le champ.'; return; }
    status.textContent='Question : '+text;
    const matches=findMatches(quiz,text,4);
    if (!matches.length) { results.append(node('p','status','Aucune correspondance dans ce quiz. Vérifie le quiz chargé ou reformule la recherche.')); return; }
    if (matches.some(match=>match.ambiguous)) results.append(node('p','ambiguous','Plusieurs questions correspondent. Compare leurs formulations et leurs propositions.'));
    for (const match of matches) {
      const card=node('article','card');
      card.append(node('p','tag',match.exact ? 'CORRESPONDANCE EXACTE' : 'RESSEMBLANCE À VÉRIFIER · '+Math.round(match.score*100)+' %'));
      card.append(node('p','question',match.question.question));
      const answers=match.question.choices.filter(choice=>choice.correct===true);
      if (!answers.length) card.append(node('p','unknown','Correction non renseignée dans les données du quiz.'));
      for (const answer of answers) {
        card.append(node('p','answer',answer.text));
        if (answer.image) card.append(node('p','status','Image : '+answer.image));
      }
      results.append(card);
    }
  }
  reread.addEventListener('click',()=>renderQuestion(true));
  manual.addEventListener('input',()=>renderQuestion(true));
  auto.addEventListener('change',()=>{
    if (interval !== null) clearInterval(interval);
    interval=auto.checked ? setInterval(()=>renderQuestion(false),1200) : null;
    renderQuestion(true);
  });
  renderQuestion(true);
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
