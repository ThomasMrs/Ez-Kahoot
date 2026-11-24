// Received text can explain an answer, but never authorizes a click by itself.
export function withReceivedQuestion(capture, received, now = Date.now()) {
  if (!capture || capture.question || !received?.observedQuestion || now >= received.expiresAt) return capture;
  let path;
  try { path = new URL(capture.url).pathname; } catch { return capture; }
  if (path !== received.path || !/^\/(?:v2\/)?gameblock\/?$/.test(path)) return capture;
  const round = String(capture.roundId || '').trim().match(/^(?:question\s+)?([1-9]\d{0,4})(?:\s*(?:\/|sur|of)\s*([1-9]\d{0,4}))?$/i);
  const observed = received.observedQuestion;
  if (!round || (round[2] && Number(round[1]) > Number(round[2])) || round[1] !== observed.roundId ||
      typeof observed.question !== 'string' || !observed.question.trim()) return capture;
  return { ...capture, question: observed.question, phase: 'question', canAnswer: false, method: 'received' };
}
