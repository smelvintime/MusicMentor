// UI: rendering, input, audio, spaced repetition. Theory lives in theory.js.
const { DECKS, isBlack } = MM;
const VF = Vex.Flow;
const $ = (id) => document.getElementById(id);

// Icons are inline SVG so they look identical on every device (no emoji fonts).
const ICON = {
  flame: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="#fbbf24" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heartbreak: '<svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="#ef4444" stroke="#ef4444" stroke-width="1.5" stroke-linejoin="round"/><path d="m12 13-1-1 2-2-3-3 2-2" fill="none" stroke="#1f2937" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
};

// ---------- persistence ----------
const S = (() => {
  const base = { w: {}, s: {}, len: 20, sound: true, mode: {}, pick: [], hard: false, inst: 'piano', fretH: false };
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
  // iPhone: play through the ringer/mute switch like a music app (Safari 16.4+).
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  ac ??= new AudioContext();
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

// gap > 0 plays the notes one after another instead of together. A long gap is a melodic
// interval (each note hands off to the next); a short one is a strum, where every string rings on.
async function play(midis, force, gap = 0) {
  const melodic = gap > 0.1;
  silence();
  if (!midis || (!S.sound && !force)) return;
  const gen = playGen;
  try {
    const notes = await Promise.all(midis.map(async (m) => [m, nearest(m), await load(nearest(m))]));
    if (gen !== playGen) return;
    const ctx = audio();
    const t = ctx.currentTime;
    notes.forEach(([m, base, buf], i) => {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      const at = t + i * gap;
      const handOff = melodic && i < notes.length - 1; // fade as the next note starts
      const end = handOff ? at + gap : at + 1.5;
      src.buffer = buf;
      src.playbackRate.value = 2 ** ((m - base) / 12);
      g.gain.setValueAtTime(melodic ? 0.8 : 0.8 / Math.sqrt(midis.length), at);
      g.gain.setTargetAtTime(0, end, handOff ? 0.08 : 0.3);
      src.connect(g).connect(ctx.destination);
      src.start(at);
      src.stop(end + 1.5);
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
    notes.forEach((x, i) => {
      if (x.tie && sn[i + 1]) new VF.StaveTie({ first_note: sn[i], last_note: sn[i + 1], first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
    });
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

// Chord chart, 5 frets from the nut, red dots where fingers press. Vertical (the usual chord chart):
// strings top to bottom, lowest on the left. Horizontal (setting, like tab): nut on the left, lowest
// string at the bottom. Shapes higher up the neck start lower and say which fret they start at.
function fretSvg(spec) {
  const frets = MM.fretsOf(spec);
  const marks = spec.split(',');
  const n = frets.length;
  const pressed = frets.filter((f) => f > 0);
  const base = Math.max(...pressed, 0) > 5 ? Math.min(...pressed) : 1;
  const flat = S.fretH;
  const gap = 22; // between strings
  const row = 26; // between frets
  const pad = 30;
  const neck = 5 * row;
  // p(s, d): string s (0 = lowest) at distance d along the neck from the nut.
  const p = flat ? (s, d) => [pad + d, 12 + (n - 1 - s) * gap] : (s, d) => [pad + s * gap, pad + d];
  const w = flat ? pad + neck + 10 : pad + (n - 1) * gap + 16;
  const h = flat ? 12 + (n - 1) * gap + 26 : pad + neck + 8;
  const line = ([x1, y1], [x2, y2], width) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${width}"/>`;
  let svg = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><g stroke="currentColor" stroke-linecap="round">`;
  for (let r = 0; r <= 5; r++) svg += line(p(0, r * row), p(n - 1, r * row), r === 0 && base === 1 ? 5 : 1.5);
  for (let s = 0; s < n; s++) svg += line(p(s, 0), p(s, neck), 1.5);
  svg += '</g>';
  if (base > 1) {
    const [x, y] = p(0, row * 0.5);
    svg += flat
      ? `<text x="${x}" y="${y + 22}" text-anchor="middle" font-size="13" fill="currentColor">${base}fr</text>`
      : `<text x="${x - 8}" y="${y + 5}" text-anchor="end" font-size="13" fill="currentColor">${base}fr</text>`;
  }
  marks.forEach((t, s) => {
    const [mx, my] = p(s, -13); // open / muted marks sit just outside the nut
    if (t === 'x') svg += `<text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="15" fill="currentColor">×</text>`;
    else if (t === '0') svg += `<circle cx="${mx}" cy="${my}" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
    else if (frets[s] > 0) {
      const [cx, cy] = p(s, (frets[s] - base + 0.5) * row);
      svg += `<circle cx="${cx}" cy="${cy}" r="8.5" fill="var(--hl)"/>`;
    }
  });
  return `<div class="fret${flat ? ' h' : ''}">${svg}</svg></div>`;
}

// ---------- quiz state ----------
let deckId, q, item, n, tally, mode, sel, locked, t0, lastId;
let streak = 0;
let advanceTimer;

function show(id) {
  silence();
  clearTimeout(advanceTimer); // leaving mid-advance must not pull you back into the quiz
  if (id !== 'metro') metStop();
  ['home', 'quiz', 'done', 'metro'].forEach((s) => { $(s).hidden = s !== id; });
  $('nav').hidden = id !== 'home' && id !== 'metro';
  document.querySelectorAll('#nav [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
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
  const pool = DECKS[id].pool(S.hard);
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
  const pool = DECKS[did].pool(S.hard);
  item = weighted(pool.length > 1 ? pool.filter((i) => i.id !== lastId) : pool, itemWeight);
  lastId = item.id;
  q = { ...DECKS[did].make(item, S.hard), deck: did };
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
  if (q.autoplay) play(q.play, true, q.gap);
  renderAnswer();
}

function drawPrompt(el, p, deck) {
  if (p.type === 'staff') drawStaff(el, p);
  if (p.type === 'piano') drawPiano(el, deck.piano, Object.fromEntries(p.highlight.map((m) => [m, 'hl'])));
  if (p.type === 'text') el.innerHTML = `<div class="bigtext">${p.text}</div>`;
  if (p.type === 'ear') el.innerHTML = `<div class="ear">${ICON.speaker}</div>`;
  if (p.type === 'fret') el.innerHTML = fretSvg(p.spec);
}

// A choice's answer value: its text, or for picture choices (chord charts) the spec it was drawn from.
const valueOf = (b) => b.dataset.v ?? b.textContent;

function renderAnswer() {
  const a = $('answer');
  if (mode === 'keys') return drawPiano(a, DECKS[q.deck].piano);
  const grid = document.createElement('div');
  const row = !q.art && q.choices.length >= 5; // note-name rows (A–G, or all ♯ / all ♭)
  grid.className = `choices${row ? ' letters' : ''}${q.choices.length === 3 ? ' three' : ''}${q.art ? ' art' : ''}`;
  if (row) grid.style.gridTemplateColumns = `repeat(${q.choices.length}, 1fr)`;
  q.choices.forEach((c) => {
    const b = document.createElement('button');
    b.className = `choice${row && c.length > 2 ? ' long' : ''}`;
    if (q.art) { b.dataset.v = c; b.innerHTML = fretSvg(c); b.setAttribute('aria-label', q.label(c)); } else b.textContent = c;
    grid.append(b);
  });
  a.replaceChildren(grid);
}

function choose(c, btn) {
  if (locked) return;
  const ok = c === q.correct;
  btn.classList.add(ok ? 'ok' : 'bad');
  if (!ok) [...$('answer').querySelectorAll('.choice')].find((b) => valueOf(b) === q.correct).classList.add('ok');
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
  else choose(valueOf(t), t);
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
  // `bass`: the inversion asked for, so your lowest key must be that note.
  const ok = norm(sel) === norm(q.keys) && (q.bass === undefined || Math.min(...sel) % 12 === q.bass);
  const want = new Set(q.keys.map((x) => (q.exact ? x : x % 12)));
  const low = Math.min(...sel);
  const wrongBass = (x) => q.bass !== undefined && x === low && x % 12 !== q.bass;
  sel.forEach((x) => $('answer').querySelector(`[data-m="${x}"]`).classList.add(want.has(q.exact ? x : x % 12) && !wrongBass(x) ? 'ok' : 'bad'));
  if (!ok) markKeys(q.keys, 'ok');
  settle(ok, [...sel].sort((a, b) => a - b).map(MM.pcName).join(' '));
}

function settle(ok, given) {
  locked = true;
  // What was wrong with your pick first, then the rule. Only for picked choices: a tapped key has no name to compare.
  const hint = [mode === 'choices' && !ok && q.why?.(given), q.hint].filter(Boolean).join('\n');
  if (!ok) logMiss(given, hint);
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
  $('hint').textContent = hint;
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
function logMiss(given, hint) {
  const named = (c) => (q.art ? q.label(c) : c); // picture choices are listed by name
  const correct = mode === 'keys' ? q.keys.map(MM.pcName).join(' ') : named(q.correct);
  history = [{ deck: q.deck, prompt: q.prompt, ask: q.ask, given: named(given), correct, hint, play: q.play, gap: q.gap }, ...history].slice(0, HISTORY_MAX);
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
    if (h.play) row.onclick = () => play(h.play, true, h.gap);
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
      drawPiano(b.querySelector('.pv'), { lo: 60, hi: Math.max(...ex.keys) > 71 ? 83 : 71 }, Object.fromEntries(ex.keys.map((m) => [m, 'hl'])));
      b.onclick = () => play(ex.keys, true, ex.gap);
      grid.append(b);
    });
  }
  body.insertAdjacentHTML('beforeend', '<button class="next">Got it</button>');
  $('sheet').hidden = false;
}

// ---------- home ----------
// Ticked decks are what "Mix" draws from; none ticked = every deck. Both only for the chosen instrument.
const RHYTHM = ['Rhythm & theory', ['values', 'count', 'keysig']];
const INSTRUMENTS = {
  piano: {
    label: 'Piano',
    sections: [['Read music', ['treble', 'bass', 'grand', 'chords']], ['Keyboard', ['pnotes', 'pchords']], RHYTHM, ['Listen', ['ear', 'perfect', 'relative']]],
  },
  guitar: { label: 'Guitar', sections: [['Guitar', ['guitarChords', 'guitarNotes']], RHYTHM] },
  ukulele: { label: 'Ukulele', sections: [['Ukulele', ['ukuleleChords', 'ukuleleNotes']], RHYTHM] },
};
if (!INSTRUMENTS[S.inst]) S.inst = 'piano';
const instDecks = () => INSTRUMENTS[S.inst].sections.flatMap(([, ids]) => ids);
const picked = () => S.pick.filter((id) => instDecks().includes(id));
const mixDecks = () => (picked().length ? picked() : instDecks());
function syncMix() {
  const names = picked().map((id) => DECKS[id].title);
  $('mixTitle').textContent = names.length ? `Mix ${names.length} deck${names.length > 1 ? 's' : ''}` : 'Mix everything';
  $('mixSub').textContent = names.length ? names.join(' · ') : `Every ${INSTRUMENTS[S.inst].label.toLowerCase()} deck, shuffled — or tick decks below`;
}
function togglePick(id, el) {
  S.pick = S.pick.includes(id) ? S.pick.filter((x) => x !== id) : [...S.pick, id];
  save();
  el.classList.toggle('on', S.pick.includes(id));
  el.setAttribute('aria-checked', S.pick.includes(id));
  syncMix();
}
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
  perfect: { type: 'ear' },
  relative: { type: 'piano', highlight: [60, 67] },
  guitarChords: { type: 'fret', spec: 'x,3,2,0,1,0' },
  guitarNotes: { type: 'fret', spec: '-,-,2,-,-,-' },
  ukuleleChords: { type: 'fret', spec: '0,0,0,3' },
  ukuleleNotes: { type: 'fret', spec: '-,2,-,-' },
};

// ---------- custom layout ----------
// Saved per instrument: { sections: [names], tiles: { name: [deck ids] } }. Tiles move only within
// their section. Decks added later go to the end of their section; ones no longer there are skipped.
const ordered = (saved = [], actual) => [...saved.filter((x) => actual.includes(x)), ...actual.filter((x) => !saved.includes(x))];
function layout() {
  const mine = S.layout?.[S.inst] || {};
  const ids = Object.fromEntries(INSTRUMENTS[S.inst].sections);
  return ordered(mine.sections, Object.keys(ids)).map((nm) => [nm, ordered(mine.tiles?.[nm], ids[nm])]);
}
function saveLayout() { // read the order back off the screen
  const secs = [...document.querySelectorAll('#decks [data-section]')];
  const tiles = Object.fromEntries(secs.map((el) => [el.dataset.section, [...el.querySelectorAll('[data-deck]')].map((b) => b.dataset.deck)]));
  S.layout = { ...S.layout, [S.inst]: { sections: secs.map((el) => el.dataset.section), tiles } };
  save();
}
let editing = false;
function setEditing(on) {
  editing = on;
  $('home').classList.toggle('editing', on);
  $('editBar').hidden = !on;
  $('gear').setAttribute('aria-pressed', on);
  $('gear').setAttribute('aria-label', on ? 'Done arranging' : 'Arrange tiles');
}

function renderHome() {
  document.querySelectorAll('[data-len]').forEach((b) => b.classList.toggle('on', +b.dataset.len === S.len));
  document.querySelectorAll('[data-inst]').forEach((b) => b.classList.toggle('on', b.dataset.inst === S.inst));
  $('fretRow').hidden = S.inst === 'piano';
  document.querySelectorAll('[data-fret]').forEach((b) => b.classList.toggle('on', (b.dataset.fret === 'h') === !!S.fretH));
  $('hard').classList.toggle('on', S.hard);
  $('hard').setAttribute('aria-checked', S.hard);
  $('decks').innerHTML = layout().map(([name, ids]) => `
    <div data-section="${name}">
    <div class="section">${name}<span class="mv-pair"><button class="mv" data-move="-1" aria-label="Move ${name} up">↑</button><button class="mv" data-move="1" aria-label="Move ${name} down">↓</button></span></div>
    <div class="decks">${ids.map((id) => `
      <button class="deck" data-deck="${id}">
        <span class="pick${S.pick.includes(id) ? ' on' : ''}" data-pick="${id}" role="checkbox" aria-checked="${S.pick.includes(id)}" aria-label="Add ${DECKS[id].title} to mix">${ICON.check}</span>
        <div class="pv"></div>
        <b>${DECKS[id].title}</b>
        <div class="muted">${DECKS[id].sub}</div>
      </button>`).join('')}
    </div></div>`).join('');
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
$('hard').onclick = () => { S.hard = !S.hard; save(); renderHome(); };
document.querySelectorAll('[data-inst]').forEach((b) => { b.onclick = () => { S.inst = b.dataset.inst; save(); renderHome(); }; });
document.querySelectorAll('[data-fret]').forEach((b) => { b.onclick = () => { S.fretH = b.dataset.fret === 'h'; save(); renderHome(); }; });
$('gear').onclick = () => setEditing(!editing);
$('editDone').onclick = () => setEditing(false);
$('resetLayout').onclick = () => { delete S.layout?.[S.inst]; save(); renderHome(); };

// Arranging: drag a tile over another in its section and they swap places as you go.
// Arrow keys move a focused tile; the ↑ ↓ buttons move a whole section.
let dragged = null;
$('decks').addEventListener('pointerdown', (e) => {
  const tile = e.target.closest('.deck');
  if (!editing || !tile) return;
  dragged = tile;
  tile.classList.add('dragging');
  tile.setPointerCapture(e.pointerId);
});
$('decks').addEventListener('pointermove', (e) => {
  if (!dragged) return;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.deck');
  if (!over || over === dragged || over.parentNode !== dragged.parentNode) return;
  const tiles = [...dragged.parentNode.children];
  dragged.parentNode.insertBefore(dragged, tiles.indexOf(over) > tiles.indexOf(dragged) ? over.nextSibling : over);
});
const endDrag = () => {
  if (!dragged) return;
  dragged.classList.remove('dragging');
  dragged = null;
  saveLayout();
};
$('decks').addEventListener('pointerup', endDrag);
$('decks').addEventListener('pointercancel', endDrag);
$('decks').addEventListener('keydown', (e) => {
  const tile = e.target.closest('.deck');
  const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!editing || !tile || !d) return;
  e.preventDefault();
  const to = d < 0 ? tile.previousElementSibling : tile.nextElementSibling?.nextElementSibling;
  if (d < 0 && !to) return;
  tile.parentNode.insertBefore(tile, to ?? null);
  tile.focus();
  saveLayout();
});
$('decks').addEventListener('click', (e) => {
  const mv = e.target.closest('[data-move]');
  if (!editing || !mv) return;
  const sec = mv.closest('[data-section]');
  const to = +mv.dataset.move < 0 ? sec.previousElementSibling : sec.nextElementSibling?.nextElementSibling;
  if (+mv.dataset.move < 0 && !to) return;
  sec.parentNode.insertBefore(sec, to ?? null);
  saveLayout();
});

$('home').addEventListener('click', (e) => {
  if (editing) return; // arranging: tiles don't open
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
  if (q.autoplay) play(q.play, true, q.gap); // listening cards: tap to hear again
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
  if (b) choose(valueOf(b), b);
});

// ---------- metronome ----------
// Its own tab. Clicks are scheduled ahead on the audio clock (a timer only tops up the
// queue), so timing stays exact even when the page is busy; visuals follow that clock.
S.met = MET.merge(S.met);
const LOOKS = { count: 'Count', pendulum: 'Pendulum', flash: 'Flash' };
const SOUND_NAMES = { click: 'Click', beep: 'Beep', wood: 'Wood', drums: 'Drums', piano: 'Piano' };
// Seconds of clicks queued ahead of the audio clock. Longer while the page is hidden,
// because browsers then run the top-up timer only about once a second.
const lookahead = () => (document.hidden ? 1.5 : 0.2);
const M = { on: false, timer: 0, out: null, next: 0, beatStart: 0, beat: 0, sub: 0, bar: 0, count: 0, queue: [], last: null, start: 0, taps: [], lock: null };

// Synthesized sounds: level 3 strong, 2 medium, 1 normal, 0.5 subdivision.
const VOL = { 3: 1, 2: 0.75, 1: 0.55, 0.5: 0.3 }; // every sound peaks near 0.8 on a strong beat
let noiseBuf;
function noise(ctx) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return Object.assign(ctx.createBufferSource(), { buffer: noiseBuf });
}
function env(ctx, t, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(M.out);
  return g;
}
function tone(ctx, t, type, f, peak, decay, f2) {
  const o = Object.assign(ctx.createOscillator(), { type });
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + decay);
  o.connect(env(ctx, t, peak, decay));
  o.start(t);
  o.stop(t + decay + 0.02);
}
function hiss(ctx, t, type, f, q, peak, decay) {
  const src = noise(ctx);
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  src.connect(fl).connect(env(ctx, t, peak, decay));
  src.start(t);
  src.stop(t + decay + 0.02);
}
const PIANO_CLICK = { 3: 84, 2: 79, 1: 72, 0.5: 67 }; // C6, G5, C5, G4
const pianoBuf = {};
// Where the note really starts in a sample (the recordings open with 10–16ms of silence) and how loud it is.
function prepPiano(buf, base) {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  chans.forEach((d) => { for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); });
  const onset = Math.min(...chans.map((d) => d.findIndex((x) => Math.abs(x) > peak * 0.05)).filter((i) => i >= 0));
  return { buf, base, skip: Math.max(0, onset / buf.sampleRate - 0.001), norm: 0.8 / (peak || 1) };
}
const SOUNDS = {
  click: (c, t, l) => { // digital tick: a short high blip plus a sharp transient
    tone(c, t, 'sine', { 3: 2600, 2: 2200, 1: 1800, 0.5: 1500 }[l], VOL[l] * 0.7, 0.03);
    hiss(c, t, 'highpass', 3000, 0.7, VOL[l] * 0.5, 0.006);
  },
  beep: (c, t, l) => tone(c, t, 'sine', { 3: 1760, 2: 1320, 1: 880, 0.5: 660 }[l], VOL[l] * 0.9, 0.08),
  wood: (c, t, l) => {
    const f = { 3: 1450, 2: 1200, 1: 950, 0.5: 800 }[l];
    tone(c, t, 'triangle', f, VOL[l] * 0.9, 0.07, f * 0.85);
    hiss(c, t, 'bandpass', f * 2, 3, VOL[l] * 0.4, 0.015);
  },
  drums: (c, t, l) => {
    if (l === 3) return tone(c, t, 'sine', 150, 1, 0.3, 45); // kick
    if (l === 2) { // snare
      hiss(c, t, 'highpass', 1500, 0.7, 0.5, 0.16);
      return tone(c, t, 'triangle', 190, 0.35, 0.08);
    }
    hiss(c, t, 'highpass', 7000, 0.8, l === 1 ? 0.5 : 0.25, l === 1 ? 0.05 : 0.03); // closed hi-hat
  },
  piano: (c, t, l) => {
    const p = pianoBuf[PIANO_CLICK[l]];
    if (!p) return SOUNDS.beep(c, t, l); // samples still loading
    const src = Object.assign(c.createBufferSource(), { buffer: p.buf });
    const rate = 2 ** ((PIANO_CLICK[l] - p.base) / 12);
    src.playbackRate.value = rate;
    const g = c.createGain(); // plain gain: the attack is the piano's own
    g.gain.setValueAtTime(VOL[l] * p.norm, t);
    g.gain.setTargetAtTime(0, t + 0.25, 0.08);
    src.connect(g).connect(M.out);
    src.start(t, p.skip); // skip the silence at the start of the recording, or every click lands late
    src.stop(t + 0.7);
  },
};

if (!SOUNDS[S.met.sound]) S.met.sound = 'click'; // a sound that was removed

function metSchedule() {
  const ctx = ac;
  const ahead = lookahead();
  while (M.next < ctx.currentTime + ahead) {
    const { at } = MET.SUBDIVISIONS[S.met.sub];
    const level = M.sub === 0 ? S.met.accents[M.beat] ?? 1 : 0.5;
    // Clicks whose time already passed (the phone slept, the page froze) are skipped,
    // not played all at once in a burst. The count carries on as if they happened.
    if (M.next >= ctx.currentTime) {
      if (level) SOUNDS[S.met.sound](ctx, M.next, level);
      M.queue.push({ t: M.next, beat: M.beat, sub: M.sub, level, bar: M.bar });
      if (M.queue.length > 64) M.queue.shift(); // hidden tab: no frames drain it
    }
    M.sub++;
    if (M.sub >= at.length) {
      M.sub = 0;
      M.beatStart += 60 / S.met.bpm;
      M.beat++;
      if (M.beat >= S.met.beats) { M.beat = 0; M.bar++; }
    }
    M.next = M.beatStart + at[M.sub] * (60 / S.met.bpm);
  }
}

async function metStart() {
  const ctx = audio();
  if (S.met.sound === 'piano') Object.values(PIANO_CLICK).forEach((m) => load(nearest(m)).then((buf) => { pianoBuf[m] ??= prepPiano(buf, nearest(m)); }).catch(() => {}));
  M.out = ctx.createGain();
  M.out.gain.value = 0.9;
  M.out.connect(ctx.destination);
  M.on = true;
  $('metPlay').textContent = 'Stop';
  $('metPlay').classList.add('on');
  // A phone's audio can take a moment to wake. Starting the count before it runs bunches the first clicks.
  await Promise.race([ctx.resume(), new Promise((r) => { setTimeout(r, 500); })]);
  if (!M.on) return; // stopped while waiting
  Object.assign(M, { beat: 0, sub: 0, bar: 0, count: 0, queue: [], last: null, start: ctx.currentTime + 0.1 });
  M.next = M.beatStart = M.start;
  metSchedule();
  M.timer = setInterval(metSchedule, 25);
  requestAnimationFrame(metFrame);
  try { M.lock = await navigator.wakeLock?.request('screen'); } catch { /* screen may still sleep */ }
}

function metStop() {
  if (!M.on) return;
  M.on = false;
  clearInterval(M.timer);
  M.out.disconnect(); // cuts clicks already queued ahead
  M.lock?.release().catch(() => {});
  M.lock = null;
  $('metPlay').textContent = 'Start';
  $('metPlay').classList.remove('on');
  renderLook();
}

// ---- visuals, driven by the audio clock ----
function metFrame() {
  if (!M.on) return;
  const now = ac.currentTime;
  while (M.queue.length && M.queue[0].t <= now) metHit(M.queue.shift());
  if (S.met.look === 'pendulum') swing(now);
  requestAnimationFrame(metFrame);
}

function metHit(e) {
  if (e.sub === 0) {
    M.last = { t: e.t, n: M.count++ };
    document.querySelectorAll('#metBeats .bt').forEach((b, i) => b.classList.toggle('now', i === e.beat));
    const secs = Math.max(0, Math.floor(e.t - M.start));
    $('metStatus').textContent = `Bar ${e.bar + 1} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const num = $('metNum');
    if (num) { num.textContent = e.beat + 1; num.className = `met-num l${e.level}`; }
  }
  const fl = $('metFlashBg');
  if (fl && e.level) {
    fl.style.background = { 3: 'var(--accent)', 2: '#93c5fd', 1: 'var(--ink)', 0.5: 'var(--ink)' }[e.level];
    fl.style.setProperty('--peak', { 3: 1, 2: 0.8, 1: 0.55, 0.5: 0.18 }[e.level]);
    fl.style.setProperty('--fade', `${Math.min(0.3, 30 / S.met.bpm)}s`);
    fl.classList.remove('go');
    void fl.offsetWidth; // restart the animation
    fl.classList.add('go');
  }
}

// Classic wind-up pendulum: at an end of its swing on every beat, the weight higher for slower tempos.
function swing(now) {
  const arm = $('metArm');
  if (!arm) return;
  let a = 26;
  if (M.last) a = 26 * Math.cos(Math.PI * (M.last.n + Math.min(1, (now - M.last.t) / (60 / S.met.bpm))));
  arm.setAttribute('transform', `rotate(${a.toFixed(2)} 100 196)`);
}

function renderLook() {
  const d = $('metDisplay');
  const status = `<div class="met-status" id="metStatus">${M.on ? '' : 'Press Start or Space'}</div>`;
  if (S.met.look === 'count') d.innerHTML = `<div class="met-num" id="metNum">1</div>${status}`;
  if (S.met.look === 'flash') d.innerHTML = `<div class="met-flash" id="metFlashBg"></div><div class="met-big" id="metFlashText"></div>${status}`;
  if (S.met.look === 'pendulum') {
    d.innerHTML = `<svg viewBox="0 0 200 210" aria-hidden="true">
      <path d="M62 204h76l-22-188H84z" fill="#2a2a2e"/><path d="M70 204h60" stroke="#48484d" stroke-width="3"/>
      <g id="metArm"><path d="M100 196V28" stroke="#f2f2f4" stroke-width="3" stroke-linecap="round"/><rect id="metWeight" x="88" width="24" height="16" rx="3" fill="#4a9eff"/></g>
      <circle cx="100" cy="196" r="5" fill="#8e8e93"/></svg>${status}`;
    swing(0);
  }
  syncBpm();
}

function renderBeats() {
  $('metBeats').innerHTML = S.met.accents.map((l, i) => `<button class="bt l${l}" data-beat="${i}" aria-label="Beat ${i + 1} accent">${'<i></i>'.repeat(3)}</button>`).join('');
}

function syncBpm() {
  const { bpm } = S.met;
  $('metBpm').textContent = bpm;
  $('metName').textContent = MET.tempoName(bpm);
  $('metSlider').value = bpm;
  $('metWeight')?.setAttribute('y', 40 + ((bpm - MET.MIN) / (MET.MAX - MET.MIN)) * 110);
  const ft = $('metFlashText');
  if (ft) ft.textContent = `${bpm} · ${MET.tempoName(bpm)}`;
}

function setBpm(v) {
  S.met.bpm = MET.clampBpm(v);
  save();
  syncBpm();
}

function renderMetro() {
  $('metSlider').min = MET.MIN;
  $('metSlider').max = MET.MAX;
  const opts = (set, list) => Object.entries(list).map(([v, label]) => `<button data-v="${v}" class="${S.met[set] === v ? 'on' : ''}">${label}</button>`).join('');
  document.querySelector('[data-set="sub"]').innerHTML = opts('sub', Object.fromEntries(Object.entries(MET.SUBDIVISIONS).map(([k, x]) => [k, x.label])));
  document.querySelector('[data-set="sound"]').innerHTML = opts('sound', SOUND_NAMES);
  document.querySelector('[data-set="look"]').innerHTML = opts('look', LOOKS);
  const meter = MET.meterOf(S.met.accents);
  $('metMeters').innerHTML = Object.keys(MET.METERS).map((m) => `<button data-meter="${m}" class="${m === meter ? 'on' : ''}">${m}</button>`).join('');
  document.querySelector('#metro .step span').textContent = S.met.beats;
  renderBeats();
  renderLook();
}

// ---- metronome events ----
// Back from the background: the phone may have paused audio (iOS calls this "interrupted").
document.addEventListener('visibilitychange', () => {
  if (M.on && !document.hidden) ac.resume();
  if (M.on) metSchedule(); // switch the queue length right away
});
$('nav').onclick = (e) => {
  const t = e.target.closest('[data-tab]')?.dataset.tab;
  if (!t) return;
  S.tab = t;
  save();
  if (t === 'metro') { renderMetro(); show('metro'); } else renderHome();
};
$('metPlay').onclick = () => (M.on ? metStop() : metStart());
$('metSlider').oninput = (e) => setBpm(+e.target.value);
$('metTap').onclick = () => {
  const now = performance.now();
  M.taps = [...M.taps, now].slice(-8);
  const bpm = MET.tapTempo(M.taps);
  if (bpm) setBpm(bpm);
};
$('metBeats').onclick = (e) => {
  const b = e.target.closest('[data-beat]');
  if (!b) return;
  S.met.accents[+b.dataset.beat] = MET.cycleAccent(S.met.accents[+b.dataset.beat]);
  save();
  renderMetro();
};
// Hold − / + to keep changing the tempo.
let holdTimer;
const stopHold = () => clearTimeout(holdTimer); // also clears the interval: they share one id pool
document.querySelectorAll('[data-bpm]').forEach((b) => {
  const d = +b.dataset.bpm;
  b.addEventListener('pointerdown', () => {
    setBpm(S.met.bpm + d);
    holdTimer = setTimeout(() => { holdTimer = setInterval(() => setBpm(S.met.bpm + d), 70); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stopHold));
  b.addEventListener('click', (e) => { if (e.detail === 0) setBpm(S.met.bpm + d); }); // keyboard
});
$('metro').addEventListener('click', (e) => {
  const step = e.target.closest('.step [data-d]');
  if (step) {
    S.met.beats = Math.min(12, Math.max(1, S.met.beats + +step.dataset.d));
    S.met.accents = MET.resize(S.met.accents, S.met.beats);
  }
  const chip = e.target.closest('[data-set] [data-v]');
  if (chip) {
    S.met[chip.closest('[data-set]').dataset.set] = chip.dataset.v;
    if (M.on && S.met.sound === 'piano') { metStop(); metStart(); } // load the samples
  }
  const meter = e.target.closest('[data-meter]');
  if (meter) {
    S.met.accents = [...MET.METERS[meter.dataset.meter]];
    S.met.beats = S.met.accents.length;
  }
  if (step || chip || meter) { save(); renderMetro(); }
});
document.addEventListener('keydown', (e) => {
  if ($('metro').hidden || e.target.matches('input')) return;
  const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
  if (d) { e.preventDefault(); setBpm(S.met.bpm + d * (e.shiftKey ? 5 : 1)); }
  if (e.key === ' ') {
    e.preventDefault();
    e.target.blur?.(); // a focused button would otherwise also activate on keyup
    $('metPlay').click();
  }
  if (e.key.toLowerCase() === 't') $('metTap').click();
});

syncSound();
if (S.tab === 'metro') { renderMetro(); show('metro'); } else renderHome();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.error('Offline mode unavailable', e));
