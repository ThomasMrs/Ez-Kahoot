// Decode quiz markup as text only: no DOM parsing, resource load or script execution.
export function plainQuizText(value, limit = 1200) {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    times: '×', divide: '÷', minus: '−', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', deg: '°', sup1: '¹', sup2: '²', sup3: '³',
    eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ugrave: 'ù', ucirc: 'û', ocirc: 'ô', icirc: 'î', iuml: 'ï', oelig: 'œ',
    Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç', Ugrave: 'Ù', Ucirc: 'Û', Ocirc: 'Ô', Icirc: 'Î', Iuml: 'Ï', OElig: 'Œ' };
  return value.slice(0, 20_000)
    .replace(/<!--(?:[\s\S]*?-->|[\s\S]*$)/g, '')
    .replace(/<(script|style|template|noscript)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<sup(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?>([\s\S]*?)<\/sup\s*>/gi, '^($1)')
    .replace(/<sub(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?>([\s\S]*?)<\/sub\s*>/gi, '_($1)')
    .replace(/<\/?(?:br|p|div|li|ul|ol|h[1-6]|blockquote|section|article|table|tr|td|th|hr)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi, ' ')
    .replace(/<\/?(?:a|abbr|b|bdi|bdo|cite|code|del|dfn|em|i|img|ins|kbd|mark|q|s|samp|small|span|strike|strong|sub|sup|time|u|var|wbr)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity, key) => {
      if (key[0] !== '#') return entities[key] ?? entities[key.toLowerCase()] ?? entity;
      const hex = key[1]?.toLowerCase() === 'x';
      const number = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ' ';
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
