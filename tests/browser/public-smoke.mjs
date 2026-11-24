import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../../', import.meta.url));
const results = path.join(project, '.browser-results');
await fs.mkdir(results, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ezk-browser-'));
import assert from 'node:assert/strict';
const root = project;
const extension = path.join(root, 'extension');
const demo = JSON.parse(await fs.readFile(path.join(root, 'public/demo.json'), 'utf8'));
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const content = q => `<h1 data-functional-selector="question-title">${esc(q.question)}</h1><div id="choices">${q.choices.map((c,i) => `<button data-functional-selector="answer-${i}">${esc(c.text)}</button>`).join('')}</div>`;
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>body{font:18px Arial;background:#eff0ff;padding:30px}button{padding:20px;margin:8px}#quiz{max-width:700px}</style></head><body><main id="quiz">${content(demo.questions[0])}</main><span data-functional-selector="question-index-counter">Question 1 sur 23</span></body></html>`;
const context = await chromium.launchPersistentContext(profile, {
  channel:'chromium', headless:true, viewport:{width:1440,height:1000},
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
});
const errors=[];
context.on('weberror', error => errors.push(error.error().message));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(() => chrome.storage.local.clear());
  await context.route('https://kahoot.it/**', route => route.fulfill({contentType:'text/html', body:html}));
  const page = await context.newPage();
  await page.goto('https://kahoot.it/gameblock');
  await page.locator('#ez-kahoot-live-panel').waitFor();
  console.log('PASS extension chargée : panneau automatique, sans popup ni serveur');
  const correct = demo.questions[0].choices.filter(c=>c.correct).map(c=>c.text);
  await page.waitForFunction(expected => {
    const panel=document.querySelector('#ez-kahoot-live-panel')?.shadowRoot;
    return panel && [...panel.querySelectorAll('.answers li')].map(li=>li.textContent).join('|')===expected.join('|');
  }, correct, {timeout:60000});
  console.log('PASS recherche publique réelle depuis le DOM : réponse exacte de la question 1');
  assert.equal(await page.locator('#ez-kahoot-live-panel input[type=checkbox]').isChecked(), false);
  await page.screenshot({path:path.join(results, 'automatic-answer.png')});
  await page.evaluate(({html}) => {
    document.querySelector('#quiz').innerHTML=html;
    document.querySelector('[data-functional-selector="question-index-counter"]').textContent='Question 2 sur 23';
  }, {html:content(demo.questions[1])});
  const next = demo.questions[1].choices.filter(c=>c.correct).map(c=>c.text);
  await page.waitForFunction(expected => [...(document.querySelector('#ez-kahoot-live-panel')?.shadowRoot.querySelectorAll('.answers li')||[])].map(li=>li.textContent).join('|')===expected.join('|'),next);
  console.log('PASS passage automatique à la question 2');
  await page.evaluate(()=>document.querySelector('#choices button').textContent='Proposition incompatible');
  await page.waitForFunction(()=>document.querySelector('#ez-kahoot-live-panel')?.shadowRoot.querySelectorAll('.answers li').length===0);
  console.log('PASS corrigé masqué dès que les propositions diffèrent');
  await page.evaluate(() => {
    document.querySelector('[data-functional-selector="question-title"]').textContent='Question inconnue de contrôle';
    document.querySelector('[data-functional-selector="question-index-counter"]').textContent='Question 3 sur 23';
  });
  await page.waitForFunction(() => document.querySelector('#ez-kahoot-live-panel')?.shadowRoot.querySelectorAll('.answers li').length===0);
  console.log('PASS ancienne réponse retirée pour une question inconnue');
  const receivedPage = await context.newPage();
  await receivedPage.goto('https://kahoot.it/gameblock?received=1');
  await receivedPage.evaluate(({ question, choices }) => {
    document.querySelector('[data-functional-selector="question-title"]').textContent='';
    document.querySelector('#choices').innerHTML='<button>Triangle</button><button>Cercle</button><button>Carré</button><button>Losange</button>';
    document.querySelector('[data-functional-selector="question-index-counter"]').textContent='Question 1 sur 23';
    const root=document.createElement('div'); root.id='root'; document.body.append(root);
    root['__reactContainer$fixture']={memoizedProps:{store:{getState:()=>({features:{gameSession:{numGameBlocks:23,questionNumber:0,gameBlockTitle:question,gameBlockState:{question:{choices,numberOfChoices:4}}}}})}}};
  }, {question:demo.questions[0].question,choices:demo.questions[0].choices.map(c=>c.text)});
  await receivedPage.waitForFunction(expected => [...(document.querySelector('#ez-kahoot-live-panel')?.shadowRoot.querySelectorAll('.answers li')||[])].map(li=>li.textContent).join('|')===expected.join('|'),correct);
  assert.equal(await receivedPage.getByRole('button',{name:'Répondre une fois',exact:true}).isEnabled(),false);
  await receivedPage.evaluate(()=>document.querySelector('[data-functional-selector="question-index-counter"]').textContent='Question 2 sur 23');
  await receivedPage.waitForFunction(()=>document.querySelector('#ez-kahoot-live-panel')?.shadowRoot.querySelectorAll('.answers li').length===0);
  await receivedPage.close();
  console.log('PASS texte reçu affiché sans clic ; réponse retirée si le numéro de question diverge');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForFunction(()=>document.body.getAttribute('aria-busy')==='false');
  assert.equal(await popup.locator('#open-live').isEnabled(),true);
  assert.equal(await popup.locator('#auto-start').isChecked(),true);
  await popup.locator('#auto-start').uncheck();
  await page.locator('#ez-kahoot-live-panel').waitFor({state:'detached'});
  await page.reload();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#ez-kahoot-live-panel').count(),0);
  await popup.locator('#auto-start').check();
  await page.locator('#ez-kahoot-live-panel').waitFor();
  console.log('PASS réglage automatique persistant et appliqué aux onglets ouverts');
  await page.bringToFront();
  await page.locator('#ez-kahoot-live-panel button[aria-label="Fermer Ez-Kahoot"]').click();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#ez-kahoot-live-panel').count(),0);
  await page.reload();
  await page.locator('#ez-kahoot-live-panel').waitFor();
  assert.equal(await page.locator('#ez-kahoot-live-panel').count(),1);
  console.log('PASS fermeture respectée et réouverture unique au rechargement');
  for(const width of [320,380]) {
    await popup.setViewportSize({width,height:1100});
    const overflow = await popup.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false);
    await popup.screenshot({path:path.join(results, `popup-${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS popup 320/380 px, aucun débordement et aucune erreur JavaScript');
} catch(error) {
  for(const page of context.pages()) {
    console.log('PAGE',page.url(),(await page.locator('body').innerText().catch(()=>'' )).slice(-3500));
    console.log('PANEL',await page.locator('#ez-kahoot-live-panel').innerText().catch(()=>''));
  }
  throw error;
} finally { await context.close(); await fs.rm(profile, { recursive: true, force: true }); }
