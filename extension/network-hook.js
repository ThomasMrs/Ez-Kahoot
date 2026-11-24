import { parseReceivedQuiz } from './network-data.js';

export function installQuizReceiver() {
  if (globalThis.__ezKahootReceiverInstalled || typeof WebSocket !== 'function') return;
  globalThis.__ezKahootReceiverInstalled = true;
  const NativeSocket = WebSocket;
  let frames = 0, accepted = 0, snapshot = null;
  globalThis.WebSocket = new Proxy(NativeSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget);
      let url;
      try { url = new URL(String(args[0]), location.href); } catch { return socket; }
      if (url.protocol !== 'wss:' || !(url.hostname === 'kahoot.it' || url.hostname.endsWith('.kahoot.it'))) return socket;
      socket.addEventListener('message', event => {
        frames++;
        const now = Date.now();
        if (globalThis.__ezKahootNetworkV1?.snapshot === null) snapshot = null;
        // Keep bounded correlation context for long questions. Discovery still
        // limits display freshness to 30 seconds and gates results by route.
        if (snapshot && (now - snapshot.updatedAt > 15 * 60_000 || /\/(?:join|lobby)(?:\/|$)/.test(location.pathname))) snapshot = null;
        let next = parseReceivedQuiz(event.data, snapshot);
        if (next?.quizId && snapshot?.quizId && next.quizId !== snapshot.quizId) {
          snapshot = null;
          next = parseReceivedQuiz(event.data, null);
        }
        if (next) {
          accepted++;
          // Metadata updates preserve context without making old text fresh.
          const updatedAt = next.observedQuestion || !snapshot ? now : snapshot.updatedAt;
          snapshot = { ...snapshot, ...next, updatedAt };
          if (next.observedQuestion && !next.revealedAnswer) delete snapshot.revealedAnswer;
        }
        globalThis.__ezKahootNetworkV1 = { snapshot, frames: Math.min(frames, 1e6), accepted: Math.min(accepted, 1e6) };
      });
      return socket;
    }
  });
}
