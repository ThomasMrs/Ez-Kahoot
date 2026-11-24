const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOSTS = new Set(['create.kahoot.it', 'play.kahoot.it', 'kahoot.it', 'www.kahoot.it']);

export function parseQuizLink(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Colle un lien Kahoot ou un UUID de quiz.');
  value = value.trim();
  if (UUID.test(value)) return { kind: 'quiz', id: value.toLowerCase() };
  let url;
  try { url = new URL(value); } catch { throw new Error('Le lien doit commencer par https://.'); }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Utilise un lien HTTPS officiel Kahoot, sans identifiants intégrés.');
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { throw new Error('Le lien est mal formé.'); }
  if (/^\/challenge(?:\/|$)/i.test(path)) return { kind: 'assignment', url: url.href };
  const match = path.match(/^\/(?:details|rest\/kahoots)\/([0-9a-f-]{36})\/?$/i) ||
    path.match(/^\/share\/(?:[^/]+\/)?([0-9a-f-]{36})\/?$/i);
  const params = [url.searchParams.get('quizId'), url.searchParams.get('kahootId')];
  if (url.hostname === 'play.kahoot.it') {
    const hash = new URLSearchParams(url.hash.replace(/^#\/?/, ''));
    params.push(hash.get('quizId'), hash.get('QuizId'));
  }
  const ids = [...new Set([match?.[1], ...params].filter(id => typeof id === 'string' && UUID.test(id)).map(id => id.toLowerCase()))];
  if (ids.length > 1) throw new Error('Plusieurs identifiants de quiz différents figurent dans ce lien.');
  if (ids.length === 1) return { kind: 'quiz', id: ids[0] };
  if (url.searchParams.has('pin') || /^\/(?:join|lobby|gameblock)\/?$/i.test(path)) return { kind: 'live', url: url.href };
  throw new Error('Aucun identifiant de quiz dans ce lien. Un PIN de partie ne suffit pas.');
}
