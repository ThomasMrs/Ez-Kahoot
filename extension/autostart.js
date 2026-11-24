/* Runs only on player pages; the packaged runtime uses Chrome's isolated world. */
(() => {
  if (globalThis.__ezKahootAutoInstalled) return;
  globalThis.__ezKahootAutoInstalled = true;
  let disposed = false;
  let revision = 0;
  const apply = enabled => {
    if (disposed) return;
    const panel = document.getElementById('ez-kahoot-live-panel');
    if (!enabled) { panel?.dispatchEvent(new Event('ez-live-dispose')); return; }
    if (!panel) globalThis.__ezKahootStart?.(null, { publicOnly: true });
  };
  const onChange = (changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, 'ezkAutoStart')) return;
    revision++;
    apply(changes.ezkAutoStart.newValue !== false);
  };
  chrome.storage.onChanged.addListener(onChange);
  const initialRevision = revision;
  chrome.storage.local.get('ezkAutoStart').then(stored => {
    if (initialRevision === revision) apply(stored.ezkAutoStart !== false);
  }).catch(() => { /* An invalidated extension context requires a page reload. */ });
  window.addEventListener('pagehide', () => {
    disposed = true;
    chrome.storage.onChanged.removeListener(onChange);
  }, { once: true });
})();
