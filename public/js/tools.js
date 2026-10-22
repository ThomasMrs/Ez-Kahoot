const icon = name => {
  const paths = {
    stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    applause: '<path d="M8 16c-3-1-4-3-3-4s3 1 4 1L7 7c-.7-2 1-3 2-1l2 5-1-7c0-2 2-2 2 0l1 6 1-5c.4-2 2-1.5 2 .5l-1 6 2-3c1-1.5 2.5-.3 1.5 1.4L17 16c-1 3-7 4-9 0ZM3 5l2 2M18 3l-1 2M21 8l-2 1"/>',
    suspense: '<path d="M3 12h2l2-6 3 13 4-16 3 12 2-3h2"/>',
    victory: '<path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v6M8 21h8M9 18h6v3"/>',
    boing: '<path d="M4 5h16M8 5l8 3-8 3 8 3-8 3 8 3M5 21h14"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.stop}</svg>`;
};

function createSoundEngine(onStatus) {
  let audio = null;
  let master = null;
  let volume = .3;
  let disposed = false;
  let generation = 0;
  const sources = new Set();
  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  function register(source, gain, start, duration) {
    source.connect(gain);
    gain.connect(master);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      try { source.disconnect(); gain.disconnect(); } catch {}
      if (!sources.size && !disposed) onStatus('Prêt pour le prochain son.');
    };
    source.start(start);
    source.stop(start + duration);
  }
  function tone(start, duration, frequency, options = {}) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.end) oscillator.frequency.exponentialRampToValueAtTime(options.end, start + duration);
    const level = options.level ?? .3;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + Math.min(.018, duration / 4));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    register(oscillator, gain, start, duration + .02);
  }
  function noise(start, duration, level = .2, type = 'highpass', frequency = 1200) {
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    source.connect(filter);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    filter.connect(gain);
    gain.connect(master);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      try { source.disconnect(); filter.disconnect(); gain.disconnect(); } catch {}
      if (!sources.size && !disposed) onStatus('Prêt pour le prochain son.');
    };
    source.start(start);
    source.stop(start + duration + .02);
  }
  async function play(name) {
    if (disposed) return;
    const playGeneration = generation;
    if (!AudioCtor) throw new Error('Votre navigateur ne permet pas de jouer ces sons.');
    if (!audio) {
      audio = new AudioCtor();
      master = audio.createGain();
      master.gain.value = volume;
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -15;
      limiter.ratio.value = 8;
      master.connect(limiter);
      limiter.connect(audio.destination);
    }
    if (audio.state === 'suspended') await audio.resume();
    if (disposed || audio.state === 'closed' || playGeneration !== generation) return;
    const now = audio.currentTime + .025;
    if (name === 'applause') {
      for (let i = 0; i < 36; i++) {
        const start = now + i * .045 + Math.random() * .04;
        noise(start, .07 + Math.random() * .07, .12 + Math.random() * .13, 'bandpass', 900 + Math.random() * 2300);
      }
    } else if (name === 'suspense') {
      for (let i = 0; i < 12; i++) {
        const step = i * .145;
        tone(now + step, .13, i % 2 ? 146.83 : 138.59, { type:'triangle', level:.22 });
        noise(now + step, .035, .07, 'highpass', 2200);
      }
      tone(now, 1.85, 55, { type:'sine', level:.25, end:65.41 });
    } else if (name === 'victory') {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
        tone(now + i * .12, i === 3 ? .8 : .25, frequency, { type:'triangle', level:.32 });
        tone(now + i * .12, i === 3 ? .85 : .24, frequency / 2, { type:'sine', level:.15 });
      });
      [523.25, 659.25, 783.99].forEach(frequency => tone(now + .67, .65, frequency, { type:'triangle', level:.12 }));
    } else if (name === 'boing') {
      tone(now, .65, 600, { type:'sine', end:85, level:.6 });
      tone(now + .12, .5, 340, { type:'triangle', end:75, level:.16 });
      tone(now + .28, .36, 230, { type:'sine', end:65, level:.14 });
    }
  }
  function stop() {
    generation++;
    sources.forEach(source => { try { source.stop(); } catch {} });
    sources.clear();
    if (!disposed) onStatus('Tous les sons sont arrêtés.');
  }
  return {
    supported: !!AudioCtor,
    play,
    stop,
    setVolume(value) { volume = Math.max(0, Math.min(1, value)); if (master && audio?.state !== 'closed') master.gain.setTargetAtTime(volume, audio.currentTime, .015); },
    cleanup() { disposed = true; stop(); if (audio && audio.state !== 'closed') audio.close().catch(() => {}); },
  };
}

export function renderTools(container, ctx) {
  let disposed = false;
  const soundLabels = { applause:'Applaudissement', suspense:'Suspense', victory:'Victoire', boing:'Boing' };
  const engine = createSoundEngine(message => {
    if (!disposed) {
      const status = container.querySelector('[data-sound-status]');
      if (status) status.textContent = message;
    }
  });
  container.innerHTML = `<div class="tools-view"><header class="tools-heading"><div><span class="tools-kicker">Le petit supplément</span><h1>La boîte à outils</h1><p>Les bons bruitages, au bon moment.</p></div><span class="tools-heading-index">4 bruitages</span></header>
    <div class="tools-grid">
    <section class="tools-panel tools-soundboard" aria-labelledby="tools-sound-title"><div class="tools-panel-heading"><span class="tools-panel-number">01</span><div><h2 id="tools-sound-title">Les bruitages</h2><p>Pour ponctuer la partie.</p></div><span class="tools-sound-dot" aria-hidden="true"></span></div>
      <div class="tools-sound-grid">${Object.entries(soundLabels).map(([key,label], index) => `<button type="button" class="tools-sound tools-sound-${key}" data-action="sound" data-sound="${key}" ${!engine.supported ? 'disabled' : ''}><span class="tools-sound-index">0${index + 1}</span>${icon(key)}<span class="tools-sound-name">${label}</span><span class="tools-sound-play" aria-hidden="true">↗</span></button>`).join('')}</div>
      <div class="tools-volume"><label for="tools-volume">Volume</label><input id="tools-volume" type="range" min="0" max="100" value="30" aria-valuetext="30 pour cent"><output for="tools-volume">30 %</output></div>
      <div class="tools-sound-footer"><p data-sound-status role="status">${engine.supported ? 'Prêt. À vous de choisir le moment.' : 'Les sons ne sont pas disponibles dans ce navigateur.'}</p><button type="button" class="tools-stop-button" data-action="stop-sounds" ${!engine.supported ? 'disabled' : ''}>${icon('stop')} Tout arrêter</button></div>
    </section></div><div class="tools-bottom-note"><span class="tools-note-line" aria-hidden="true"></span><p>Le meilleur timing fait toute la différence.</p><span class="tools-note-line" aria-hidden="true"></span></div></div>`;

  async function handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !container.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'sound') {
      const sound = button.dataset.sound;
      container.querySelector('[data-sound-status]').textContent = `Lecture : ${soundLabels[sound]}.`;
      try { await engine.play(sound); } catch (error) {
        if (!disposed) { container.querySelector('[data-sound-status]').textContent = 'Le son n’a pas pu démarrer.'; ctx.toast(error.message, 'error'); }
      }
    } else if (action === 'stop-sounds') engine.stop();
  }
  function handleInput(event) {
    if (event.target.id !== 'tools-volume') return;
    const percent = Math.max(0, Math.min(100, Number(event.target.value)));
    engine.setVolume(percent / 100);
    event.target.setAttribute('aria-valuetext', `${percent} pour cent`);
    container.querySelector('.tools-volume output').textContent = `${percent} %`;
  }
  container.addEventListener('click', handleClick);
  container.addEventListener('input', handleInput);
  return () => { disposed = true; engine.cleanup(); container.removeEventListener('click', handleClick); container.removeEventListener('input', handleInput); };
}
