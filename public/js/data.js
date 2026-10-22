const LIBRARY_KEY = 'ez-kahoot.library.v1';
const SETTINGS_KEY = 'ez-kahoot.settings.v1';
const MAX_QUIZZES = 24;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function readLibrary() {
  try {
    const stored = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(quiz => quiz && typeof quiz.id === 'string' &&
      typeof quiz.title === 'string' && Array.isArray(quiz.questions))
      .slice(0, MAX_QUIZZES);
  } catch { return []; }
}

export function saveQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.questions)) return false;
  try {
    const entry = { ...quiz, savedAt: new Date().toISOString() };
    const next = [entry, ...readLibrary().filter(item => item.id !== quiz.id)]
      .slice(0, MAX_QUIZZES);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

export function deleteQuiz(id) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(readLibrary().filter(quiz => quiz.id !== id)));
    return true;
  } catch { return false; }
}

export function readSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  } catch { return {}; }
}

export function writeSettings(patch) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }));
    return true;
  } catch { return false; }
}
