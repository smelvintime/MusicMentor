// UI: rendering, input, audio, spaced repetition. Theory lives in theory.js.
const { DECKS, isBlack } = MM;
const VF = Vex.Flow;
const $ = (id) => document.getElementById(id);
const SHARPS_FLATS = true; // always on: every deck includes sharps, flats, diminished and augmented

// Icons are inline SVG so they look identical on every device (no emoji fonts).
const ICON = {
  flame: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="#fbbf24" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heartbreak: '<svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="#ef4444" stroke="#ef4444" stroke-width="1.5" stroke-linejoin="round"/><path d="m12 13-1-1 2-2-3-3 2-2" fill="none" stroke="#1f2937" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
};

// ---------- persistence ----------
const S = (() => {
  const base = { w: {}, s: {}, len: 20, sound: true, mode: {}, pick: [] };
  try { return { ...base, ...JSON.parse(localStorage.getItem('mm')) }; } catch { return base; }
})();
const save = () => { try { localStorage.setItem('mm', JSON.stringify(S)); } catch { /* private mode: progress just won't persist */ } };

// ---------- audio ----------
// Salamander Grand Piano samples (piano/), one every 3 semitones; the nearest is pitch-shifted.
const SAMPLES = { 96: 'C7' };
for (let o = 2; o <= 6; o++) ['C', 'Ds', 'Fs', 'A'].forEach((nm, i) => { SAMPLES[12 * (o + 1) + i * 3] = nm + o; });
const SAMPLE_KEYS = Object.keys(SAMPLES).map(Number);
const buffers = {};
let ac;
function audio() {
  ac ??= new (window.AudioContext || window.webkitAudioContext)();
  ac.resume();
  return ac;
}
function load(m) {
  buffers[m] ??= fetch(`piano/${SAMPLES[m]}.mp3`)
    .then((r) => r.arrayBuffer())
    .then((b) => audio().decodeAudioData(b))
    .catch((e) => { delete buffers[m]; throw e; });
  return buffers[m];
}
const nearest = (m) => SAMPLE_KEYS.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
const preload = () => SAMPLE_KEYS.forEach((m) => load(m).catch(() => {}));

// Only one sound at a time: a new sound (or a new card) quickly fades out the previous one.
let voices = [];
let playGen = 0;
function silence() {
  playGen++; // also cancels a play() still waiting on samples
  if (!ac) return;
  const t = ac.currentTime;
  voices.forEach(({ src, g }) => {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.015);
    src.stop(t + 0.1);
  });
  voices = [];
}

async function play(midis, force) {
  silence();
  if (!midis || (!S.sound && !force)) return;
  const gen = playGen;
  try {
    const notes = await Promise.all(midis.map(async (m) => [m, nearest(m), await load(nearest(m))]));
    if (gen !== playGen) return;
    const ctx = audio();
    const t = ctx.currentTime;
    notes.forEach(([m, base, buf]) => {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      src.playbackRate.value = 2 ** ((m - base) / 12);
      g.gain.setValueAtTime(0.8 / Math.sqrt(midis.length), t);
      g.gain.setTargetAtTime(0, t + 1.5, 0.3);
      src.connect(g).connect(ctx.destination);
      src.start(t);
      src.stop(t + 3);
      voices.push({ src, g });
    });
  } catch (e) {
    console.error('Piano sample failed to load', e);
  }
}

// ---------- drawing ----------
function drawStaff(el, p, labels) {
  el.replaceChildren();
  el.style.cssText = '';
  const notes = p.notes || [];
  const st = new VF.Stave(10, 10, 400);
  if (p.clef) st.addClef(p.clef);
  if (p.keySig) st.addKeySignature(p.keySig);
  if (p.timeSig) st.addTimeSignature(p.timeSig);
  const per = notes.length > 1 ? 44 : 90;
  const w = st.getNoteStartX() + Math.max(notes.length * per, 20) + 10;
  st.setWidth(w);
  const W = w + 20;
  const H = 140;
  const r = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  r.resize(W, H);
  const ctx = r.getContext();
  st.setContext(ctx).draw();
  if (notes.length) {
    const sn = notes.map((x, i) => {
      const n = new VF.StaveNote({ clef: p.clef || 'treble', keys: x.keys, duration: x.dur, auto_stem: !x.dur.includes('r') });
      (x.accs || []).forEach((a, j) => a && n.addModifier(new VF.Accidental(a), j));
      if (x.dur.includes('d')) VF.Dot.buildAndAttach([n], { all: true });
      if (labels) n.addModifier(new VF.Annotation(labels[i]).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
      return n;
    });
    VF.Formatter.FormatAndDraw(ctx, st, sn, { auto_beam: true });
  }
  const svg = el.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.cssText = '';
}

function drawPiano(el, { lo, hi }, marks = {}) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const ww = 100 / whites.length;
  const div = document.createElement('div');
  div.className = 'piano';
  for (let m = lo; m <= hi; m++) {
    const k = document.createElement('button');
    k.dataset.m = m;
    if (isBlack(m)) {
      k.className = 'key b';
      k.style.left = `${whites.findIndex((x) => x > m) * ww - ww * 0.3}%`;
      k.style.width = `${ww * 0.6}%`;
    } else {
      k.className = 'key w';
      k.style.left = `${whites.indexOf(m) * ww}%`;
      k.style.width = `${ww}%`;
      if (m % 12 === 0) k.innerHTML = `<small>C${m / 12 - 1}</small>`;
    }
    if (marks[m]) k.classList.add(marks[m]);
    div.append(k);
  }
  el.replaceChildren(div);
}

// ---------- quiz state ----------
let deckId, q, item, n, tally, mode, sel, locked, t0, lastId;
let streak = 0;
let advanceTimer;

function show(id) {
  silence();
  clearTimeout(advanceTimer); // leaving mid-advance must not pull you back into the quiz
  ['home', 'quiz', 'done'].forEach((s) => { $(s).hidden = s !== id; });
  $('sheet').hidden = true;
}

function start(id) {
  preload();
  deckId = id;
  n = 0;
  // Running totals, not a per-answer log: infinite mode stays constant-memory.
  // `missed` is capped by the deck's item count.
  tally = { n: 0, ok: 0, ms: 0, missed: new Set() };
  $('streak').replaceChildren();
  if (streak >= 2) renderStreak(streak);
  show('quiz');
  nextQ();
  if (id !== 'mix' && !S.s[id]) openLearn(id);
}

// Struggle score per card: unseen = 1, each miss doubles it (+1, max 10), fast
// right answers shrink it (min 0.3). Cards are drawn in proportion to it, so
// weak spots come up far more often while mastered ones still appear now and then.
const itemWeight = (i) => S.w[i.id] ?? 1;
// A deck's struggle = its cards' average, so Mix leans toward your weakest decks too.
const deckWeight = (id) => {
  const pool = DECKS[id].pool(SHARPS_FLATS);
  return pool.reduce((a, i) => a + itemWeight(i), 0) / pool.length;
};

function weighted(list, weightOf) {
  const ws = list.map(weightOf);
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  return list.find((_, i) => (r -= ws[i]) < 0) || list.at(-1);
}

function nextQ() {
  silence();
  clearTimeout(advanceTimer);
  if (S.len && n >= S.len) return finish(); // len 0 = infinite
  const did = deckId === 'mix' ? weighted(mixDecks(), deckWeight) : deckId;
  const pool = DECKS[did].pool(SHARPS_FLATS);
  item = weighted(pool.length > 1 ? pool.filter((i) => i.id !== lastId) : pool, itemWeight);
  lastId = item.id;
  q = { ...DECKS[did].make(item, SHARPS_FLATS), deck: did };
  n++;
  locked = false;
  sel = new Set();
  t0 = performance.now();
  render();
}

function render() {
  const deck = DECKS[q.deck];
  $('count').textContent = S.len ? `${n} / ${S.len}` : `${tally.ok} / ${tally.n} correct`;
  $('progress').style.width = S.len ? `${((n - 1) / S.len) * 100}%` : '0';
  $('ask').textContent = deckId === 'mix' ? `${deck.title} · ${q.ask}` : q.ask;
  $('hint').hidden = true;
  $('next').hidden = true;
  const both = q.choices && q.keys;
  mode = both ? (S.mode[q.deck] || 'choices') : q.keys ? 'keys' : 'choices';
  $('tabs').style.visibility = both ? 'visible' : 'hidden';
  $('tabs').hidden = false;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));

  drawPrompt($('prompt'), q.prompt, deck);
  if (q.autoplay) play(q.play, true);
  renderAnswer();
}

function drawPrompt(el, p, deck) {
  if (p.type === 'staff') drawStaff(el, p);
  if (p.type === 'piano') drawPiano(el, deck.piano, Object.fromEntries(p.highlight.map((m) => [m, 'hl'])));
  if (p.type === 'text') el.innerHTML = `<div class="bigtext">${p.text}</div>`;
  if (p.type === 'ear') el.innerHTML = `<div class="ear">${ICON.speaker}</div>`;
}

function renderAnswer() {
  const a = $('answer');
  if (mode === 'keys') return drawPiano(a, DECKS[q.deck].piano);
  const grid = document.createElement('div');
  const row = q.choices.length >= 5; // note-name rows (A–G, or all ♯ / all ♭)
  grid.className = `choices${row ? ' letters' : ''}${q.choices.length === 3 ? ' three' : ''}`;
  if (row) grid.style.gridTemplateColumns = `repeat(${q.choices.length}, 1fr)`;
  q.choices.forEach((c) => {
    const b = document.createElement('button');
    b.className = `choice${row && c.length > 2 ? ' long' : ''}`;
    b.textContent = c;
    grid.append(b);
  });
  a.replaceChildren(grid);
}

function choose(c, btn) {
  if (locked) return;
  const ok = c === q.correct;
  btn.classList.add(ok ? 'ok' : 'bad');
  if (!ok) [...$('answer').querySelectorAll('.choice')].find((b) => b.textContent === q.correct).classList.add('ok');
  settle(ok, c);
}

// Answers commit on RELEASE: press, slide onto the right key or button if you
// fat-fingered, then lift. Sliding off everything cancels.
let pressed = null;
let pressing = false;
const answerAt = (x, y) => document.elementFromPoint(x, y)?.closest('#answer [data-m], #answer .choice') || null;
function setPressed(el) {
  if (el === pressed) return;
  pressed?.classList.remove('press');
  pressed = el;
  pressed?.classList.add('press');
}
$('answer').addEventListener('pointerdown', (e) => {
  if (locked) return;
  e.preventDefault();
  $('answer').setPointerCapture(e.pointerId); // keep getting moves after the finger leaves the key
  pressing = true;
  setPressed(answerAt(e.clientX, e.clientY));
});
$('answer').addEventListener('pointermove', (e) => { if (pressing) setPressed(answerAt(e.clientX, e.clientY)); });
$('answer').addEventListener('pointerup', () => {
  if (!pressing) return;
  pressing = false;
  const t = pressed;
  setPressed(null);
  if (!t || locked) return;
  if (t.dataset.m) tapKey(+t.dataset.m, t);
  else choose(t.textContent, t);
});
$('answer').addEventListener('pointercancel', () => { pressing = false; setPressed(null); });

const markKeys = (keys, cls) => keys.forEach((m) => $('answer').querySelector(`[data-m="${m}"]`)?.classList.add(cls));

function tapKey(m, k) {
  if (locked) return;
  if (q.keys.length === 1) {
    const ok = q.exact ? m === q.keys[0] : m % 12 === q.keys[0] % 12;
    k.classList.add(ok ? 'ok' : 'bad');
    if (!ok) markKeys(q.keys, 'ok');
    return settle(ok, MM.pcName(m));
  }
  if (sel.has(m)) { sel.delete(m); k.classList.remove('sel'); return; }
  sel.add(m);
  k.classList.add('sel');
  play([m]);
  if (sel.size < q.keys.length) return;
  const norm = (ms) => [...new Set([...ms].map((x) => (q.exact ? x : x % 12)))].sort().join();
  const ok = norm(sel) === norm(q.keys);
  const want = new Set(q.keys.map((x) => (q.exact ? x : x % 12)));
  sel.forEach((x) => $('answer').querySelector(`[data-m="${x}"]`).classList.add(want.has(q.exact ? x : x % 12) ? 'ok' : 'bad'));
  if (!ok) markKeys(q.keys, 'ok');
  settle(ok, [...sel].sort((a, b) => a - b).map(MM.pcName).join(' '));
}

function settle(ok, given) {
  locked = true;
  if (!ok) logMiss(given);
  const ms = performance.now() - t0;
  tally = { ...tally, n: tally.n + 1, ok: tally.ok + (ok ? 1 : 0), ms: tally.ms + ms };
  if (!ok) tally.missed.add(item.label);
  const w = S.w[item.id] ?? 1;
  // Missed items come back much more often; fast correct answers fade out.
  S.w[item.id] = ok ? Math.max(0.3, w * (ms < 3000 ? 0.6 : 0.9)) : Math.min(10, w * 2 + 1);
  const st = S.s[q.deck] || { n: 0, c: 0 };
  S.s[q.deck] = { n: st.n + 1, c: st.c + (ok ? 1 : 0) };
  save();
  const prev = streak;
  streak = ok ? streak + 1 : 0;
  renderStreak(prev);
  if (!q.autoplay) play(q.play); // ear cards were already heard
  if (ok) { advanceTimer = setTimeout(nextQ, 450); return; }
  $('hint').textContent = q.hint;
  $('hint').hidden = false;
  $('next').hidden = false;
  $('tabs').hidden = true;
}

// ---------- streak (same behavior as the blackjack trainer) ----------
function renderStreak(prev) {
  const el = $('streak');
  if (streak === 0 && prev >= 2) {
    el.innerHTML = `<div class="streak-box wash">${ICON.heartbreak}<span class="lost">Streak Lost</span></div>`;
    // Remove it once faded, or re-showing the quiz screen would replay the animation.
    el.firstElementChild.addEventListener('animationend', (e) => e.target.remove());
    return;
  }
  if (streak < 2) return;
  let box = el.querySelector('.streak-box:not(.wash)');
  if (!box) {
    el.innerHTML = `<div class="streak-box">${ICON.flame}<span></span></div>`;
    box = el.firstElementChild;
  }
  box.querySelector('span').textContent = `${streak} Streak!`;
  if (streak === 50 && streak > prev) {
    box.classList.remove('burst');
    void box.offsetWidth; // restart the animation
    box.classList.add('burst');
    setTimeout(() => box.classList.remove('burst'), 1500);
  }
  if (streak > prev && [100, 200, 300].includes(streak)) announce(streak);
}

let announceTimer;
function announce(num) {
  const a = $('announce');
  a.className = `announce-${num}`;
  a.innerHTML = `<div class="number">${num}</div>`;
  a.hidden = false;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { a.hidden = true; }, 3500);
}

// ---------- history of misses ----------
const HISTORY_MAX = 50; // newest first; capped so infinite mode can't grow it forever
let history = [];
function logMiss(given) {
  const correct = mode === 'keys' ? q.keys.map(MM.pcName).join(' ') : q.correct;
  history = [{ deck: q.deck, prompt: q.prompt, ask: q.ask, given, correct, hint: q.hint, play: q.play }, ...history].slice(0, HISTORY_MAX);
}

function openHistory() {
  const body = $('sheetBody');
  body.innerHTML = `<h2>Missed</h2>${history.length ? '<div class="muted">Newest first. Tap one to hear it.</div>' : '<p class="muted">Nothing missed yet.</p>'}`;
  history.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'hist';
    const pr = document.createElement('div');
    pr.className = 'prompt';
    drawPrompt(pr, h.prompt, DECKS[h.deck]);
    row.append(pr);
    row.insertAdjacentHTML('beforeend', `<div class="muted">${h.ask}</div>
      <div class="verdict"><span class="c-bad">${h.given}</span><span class="muted">→</span><span class="c-ok">${h.correct}</span></div>
      <div class="hint">${h.hint}</div>`);
    if (h.play) row.onclick = () => play(h.play, true);
    body.append(row);
  });
  body.insertAdjacentHTML('beforeend', '<button class="next">Close</button>');
  $('sheet').hidden = false;
}

function finish() {
  const { n: total, ok: c, ms } = tally;
  const avg = ms / Math.max(total, 1) / 1000;
  $('doneDeck').textContent = deckId === 'mix' ? 'Mix' : DECKS[deckId].title;
  $('score').textContent = `${Math.round((c / Math.max(total, 1)) * 100)}%`;
  $('doneSub').textContent = `${c} / ${total} correct · ${avg.toFixed(1)}s per answer`;
  const missed = [...tally.missed];
  $('missed').innerHTML = missed.map((l) => `<span>${l}</span>`).join('');
  $('review').hidden = !missed.length;
  show('done');
}

// ---------- learn sheet ----------
function openLearn(id) {
  const d = DECKS[id];
  const body = $('sheetBody');
  body.innerHTML = `<h2>${d.title}</h2><ul>${d.learn.map((l) => `<li>${l}</li>`).join('')}</ul>`;
  (d.ref || []).forEach((r) => {
    const div = document.createElement('div');
    div.className = 'ref';
    body.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: r.label }), div);
    drawStaff(div, { clef: r.clef, notes: r.notes.map((k) => ({ keys: [k], dur: 'w' })) }, r.notes.map((k) => k[0].toUpperCase()));
  });
  if (d.examples) {
    body.insertAdjacentHTML('beforeend', '<div class="muted">Tap to hear</div><div class="examples"></div>');
    const grid = body.querySelector('.examples');
    d.examples.forEach((ex) => {
      const b = document.createElement('button');
      b.className = 'ex';
      b.innerHTML = `<div class="pv"></div><b>${ex.label}</b><span class="muted">${ex.notes}</span>`;
      drawPiano(b.querySelector('.pv'), { lo: 60, hi: 71 }, Object.fromEntries(ex.keys.map((m) => [m, 'hl'])));
      b.onclick = () => play(ex.keys, true);
      grid.append(b);
    });
  }
  body.insertAdjacentHTML('beforeend', '<button class="next">Got it</button>');
  $('sheet').hidden = false;
}

// ---------- home ----------
// Ticked decks are what "Mix" draws from; none ticked = every deck.
const mixDecks = () => (S.pick.length ? S.pick : Object.keys(DECKS));
function syncMix() {
  const names = S.pick.map((id) => DECKS[id].title);
  $('mixTitle').textContent = names.length ? `Mix ${names.length} deck${names.length > 1 ? 's' : ''}` : 'Mix everything';
  $('mixSub').textContent = names.length ? names.join(' · ') : 'Every deck, shuffled — or tick decks below';
}
function togglePick(id, el) {
  S.pick = S.pick.includes(id) ? S.pick.filter((x) => x !== id) : [...S.pick, id];
  save();
  el.classList.toggle('on', S.pick.includes(id));
  el.setAttribute('aria-checked', S.pick.includes(id));
  syncMix();
}
const SECTIONS = [
  ['Read music', ['treble', 'bass', 'grand', 'chords']],
  ['Keyboard', ['pnotes', 'pchords']],
  ['Rhythm & theory', ['values', 'count', 'keysig']],
  ['Listen', ['ear']],
];
const note = (keys, dur = 'w') => ({ keys, dur });
const PREVIEW = {
  treble: { clef: 'treble', notes: [note(['e/5'])] },
  bass: { clef: 'bass', notes: [note(['f/3'])] },
  grand: {}, // drawn as treble / bass in renderHome
  chords: { clef: 'treble', notes: [note(['c/4', 'e/4', 'g/4'])] },
  values: { clef: null, notes: [note(['b/4'], 'h'), note(['b/4'], 'q'), note(['b/4'], '8'), note(['b/4'], '8')] },
  count: { clef: 'treble', timeSig: '3/4', notes: [] },
  keysig: { clef: 'treble', keySig: 'D', notes: [] },
  pnotes: { type: 'piano', highlight: [64] },
  pchords: { type: 'piano', highlight: [60, 64, 67] },
  ear: { type: 'ear' },
};

function renderHome() {
  document.querySelectorAll('[data-len]').forEach((b) => b.classList.toggle('on', +b.dataset.len === S.len));
  $('decks').innerHTML = SECTIONS.map(([name, ids]) => `
    <div class="section">${name}</div>
    <div class="decks">${ids.map((id) => `
      <button class="deck" data-deck="${id}">
        <span class="pick${S.pick.includes(id) ? ' on' : ''}" data-pick="${id}" role="checkbox" aria-checked="${S.pick.includes(id)}" aria-label="Add ${DECKS[id].title} to mix">${ICON.check}</span>
        <div class="pv"></div>
        <b>${DECKS[id].title}</b>
        <div class="muted">${DECKS[id].sub}</div>
      </button>`).join('')}
    </div>`).join('');
  document.querySelectorAll('#decks .pv').forEach((el) => {
    const id = el.closest('[data-deck]').dataset.deck;
    const p = { type: 'staff', ...PREVIEW[id] };
    if (id === 'grand') {
      el.innerHTML = '<div></div><span class="slash">/</span><div></div>';
      drawStaff(el.children[0], { clef: 'treble', notes: [] });
      drawStaff(el.children[2], { clef: 'bass', notes: [] });
    } else {
      drawPrompt(el, p, { piano: { lo: 60, hi: 71 } });
    }
    // Crop the empty space above/below the staff so the preview reads at tile size.
    if (p.type === 'staff') {
      el.querySelectorAll('svg[viewBox]').forEach((svg) => svg.setAttribute('viewBox', svg.getAttribute('viewBox').replace(/ 0 (\S+) \d+$/, ' 22 $1 96')));
    }
  });
  syncMix();
  show('home');
}

// ---------- events ----------
$('home').addEventListener('click', (e) => {
  const pk = e.target.closest('[data-pick]');
  if (pk) return togglePick(pk.dataset.pick, pk);
  const b = e.target.closest('[data-deck]'); if (b) start(b.dataset.deck); });
document.querySelectorAll('[data-len]').forEach((b) => { b.onclick = () => { S.len = +b.dataset.len; save(); renderHome(); }; });
// In infinite mode, leaving shows the round summary instead of dropping the stats.
$('quit').onclick = () => (!S.len && tally.n ? finish() : renderHome());
$('homeBtn').onclick = renderHome;
$('again').onclick = () => start(deckId);
$('next').onclick = nextQ;
$('historyBtn').onclick = openHistory;
$('review').onclick = openHistory;
$('learnBtn').onclick = () => openLearn(q.deck);
$('sheet').onclick = (e) => { if (e.target.id === 'sheet' || e.target.matches('.next')) $('sheet').hidden = true; };
$('card').onclick = () => {
  if (q.prompt.type === 'ear') play(q.play, true);
  else if (locked && !$('next').hidden) nextQ();
};
$('announce').onclick = () => { $('announce').hidden = true; };
const syncSound = () => $('sound').classList.toggle('off', !S.sound);
$('sound').onclick = () => { S.sound = !S.sound; save(); syncSound(); };
$('tabs').onclick = (e) => {
  const m = e.target.dataset.mode;
  if (!m || locked) return;
  S.mode[q.deck] = m;
  save();
  render();
};
document.addEventListener('keydown', (e) => {
  if ($('quiz').hidden) return;
  if (e.key === 'Escape') return renderHome();
  if (locked) { if ((e.key === 'Enter' || e.key === ' ') && !$('next').hidden) { e.preventDefault(); nextQ(); } return; }
  if (mode !== 'choices') return;
  const btns = [...$('answer').querySelectorAll('.choice')];
  const b = /^[1-9]$/.test(e.key) ? btns[e.key - 1] : btns.find((x) => x.textContent.toLowerCase() === e.key.toLowerCase());
  if (b) choose(b.textContent, b);
});

syncSound();
renderHome();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.error('Offline mode unavailable', e));
