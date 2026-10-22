const paths={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 play:'<path d="m9 5 11 7-11 7z"/><path d="M3 5v14"/>',
 cards:'<rect x="6" y="6" width="15" height="15" rx="3"/><path d="M3 16V6a3 3 0 0 1 3-3h10M10 11h7M10 15h5"/>',
 library:'<path d="M4 4h4v16H4zM11 4h4v16h-4zM18 5l3 14"/>',
 tools:'<path d="m14 6 4-4a7 7 0 0 1-8 9L4 20a2 2 0 0 1-3-3l9-6a7 7 0 0 1 9-8l-4 4z"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 up:'<path d="m7 17 10-10M7 7h10v10"/>',
 link:'<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4V3H3v13h1"/>',
 save:'<path d="M6 3h12v18l-6-4-6 4z"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
 bolt:'<path d="m14 2-9 12h6l-1 8 9-12h-6z"/>'
};
export function icon(name,cls=''){return `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.grid}</svg>`;}
