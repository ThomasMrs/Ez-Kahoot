import { escapeHtml } from './data.js';

function choiceText(choice) {
  return choice.image ? `${choice.text} [image : ${choice.image}]` : choice.text;
}

function correctTexts(question) {
  const answers = question.choices.filter(choice => choice.correct === true).map(choiceText);
  return answers.length ? answers : ['Corrigé non disponible'];
}

function asText(quiz) {
  const lines = [quiz.title, `Ez-Kahoot · créé par thomas marsa`, ''];
  quiz.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.question}`);
    if (question.image) lines.push(`   Illustration : ${question.image}`);
    correctTexts(question).forEach(answer => lines.push(`   → ${answer}`));
    lines.push('');
  });
  if (quiz.sourceUrl) lines.push(`Source : ${quiz.sourceUrl}`);
  return lines.join('\n');
}

function filename(quiz) {
  return (quiz.title || 'quiz').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 72) || 'quiz';
}

function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet programs interpret leading formula characters even inside quoted CSV cells.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportQuiz(quiz, format = 'txt') {
  if (!quiz?.questions?.length) throw new Error('Charge un quiz avant de l’exporter.');
  let content;
  let mime;
  if (format === 'json') {
    content = JSON.stringify(quiz, null, 2);
    mime = 'application/json;charset=utf-8';
  } else if (format === 'csv') {
    const rows = [['Numéro', 'Question', 'Bonnes réponses', 'Nombre de bonnes réponses', 'Toutes les propositions', 'Illustration']];
    quiz.questions.forEach((question, index) => rows.push([
      index + 1, question.question, correctTexts(question).join(' | '),
      question.choices.filter(choice => choice.correct === true).length,
      question.choices.map(choiceText).join(' | '), question.image || ''
    ]));
    content = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    mime = 'text/csv;charset=utf-8';
  } else if (format === 'txt') {
    content = asText(quiz);
    mime = 'text/plain;charset=utf-8';
  } else throw new Error('Format d’export inconnu.');
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ez-kahoot-${filename(quiz)}.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyAnswers(quiz) {
  if (!quiz?.questions?.length) throw new Error('Charge un quiz pour copier le corrigé.');
  const text = asText(quiz);
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* Try the local fallback below. */ }
  }
  const previousFocus = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('aria-label', 'Corrigé à copier');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  textarea.remove();
  previousFocus?.focus();
  if (!success) throw new Error('Copie indisponible dans ce navigateur. Utilise l’export TXT.');
  return true;
}

export function printQuiz(quiz) {
  if (!quiz?.questions?.length) throw new Error('Charge un quiz avant de l’imprimer.');
  document.querySelector('#ez-print-sheet')?.remove();
  const sheet = document.createElement('section');
  sheet.id = 'ez-print-sheet';
  sheet.innerHTML = `<header><p>EZ-KAHOOT · CORRIGÉ</p><h1>${escapeHtml(quiz.title)}</h1>
    <p>${quiz.questions.length} questions · créé par thomas marsa</p></header>` +
    quiz.questions.map((question, index) => `<article><h2>${index + 1}. ${escapeHtml(question.question)}</h2>
      <ul>${correctTexts(question).map(answer => `<li>${escapeHtml(answer)}</li>`).join('')}</ul></article>`).join('') +
    `<footer>Ez-Kahoot · thomas marsa${quiz.sourceUrl ? ` · ${escapeHtml(quiz.sourceUrl)}` : ''}</footer>`;
  const style = document.createElement('style');
  style.textContent = `#ez-print-sheet{display:none}@media print{body>*:not(#ez-print-sheet){display:none!important}body{background:white!important;color:#111!important}#ez-print-sheet{display:block;font-family:Arial,sans-serif;font-size:11pt;line-height:1.5}#ez-print-sheet h1{font-size:24pt}#ez-print-sheet h2{font-size:12pt}#ez-print-sheet article{break-inside:avoid;border-top:1px solid #ddd;padding:6px 0}#ez-print-sheet ul{padding-left:20px}#ez-print-sheet footer{font-size:9pt;margin-top:24px}}`;
  sheet.append(style);
  document.body.append(sheet);
  window.print();
}
