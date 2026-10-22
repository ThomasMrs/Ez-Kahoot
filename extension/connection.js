export function validateConnection(value) {
  if (!value || typeof value !== 'object' || typeof value.baseUrl !== 'string' || typeof value.token !== 'string') {
    throw new Error('Ce code de connexion n’est pas valide. Recopie-le depuis Ez-Kahoot.');
  }
  let url;
  try { url = new URL(value.baseUrl); } catch { throw new Error('L’adresse du serveur local est invalide.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
      url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('La connexion doit pointer vers le serveur Ez-Kahoot sur 127.0.0.1.');
  }
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[A-Za-z0-9_-]{24,128}$/.test(value.token)) {
    throw new Error('Le code local est incomplet ou invalide.');
  }
  return { baseUrl: url.origin, token: value.token };
}

export function decodeConnection(code) {
  const compact = String(code || '').replace(/\s+/g, '');
  if (compact.length > 2048 || !/^EZK1\.[A-Za-z0-9_-]+={0,2}$/.test(compact)) {
    throw new Error('Colle le code complet qui commence par EZK1.');
  }
  try {
    const encoded = compact.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    return validateConnection(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error.message?.includes('127.0.0.1') || error.message?.includes('incomplet')) throw error;
    throw new Error('Ce code de connexion est illisible. Recopie-le depuis Ez-Kahoot.');
  }
}
