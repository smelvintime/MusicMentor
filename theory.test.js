// Run: node theory.test.js
const assert = require('assert');
const MM = require('./theory.js');
const { note, midi, triad, staffHint, DECKS } = MM;
const rand = (a) => a[Math.floor(Math.random() * a.length)];

assert.strictEqual(midi(note('C', '', 4)), 60);
assert.strictEqual(midi(note('A', '', 4)), 69);
assert.strictEqual(midi(note('B', 'b', 3)), 58);

const spell = (l, a, q) => triad(note(l, a, 4), q).map((n) => n.letter + n.acc).join(' ');
assert.strictEqual(spell('C', '', 'maj'), 'C E G');
assert.strictEqual(spell('D', '', 'maj'), 'D F# A');
assert.strictEqual(spell('A', '', 'min'), 'A C E');
assert.strictEqual(spell('B', '', 'dim'), 'B D F');
assert.strictEqual(spell('E', 'b', 'maj'), 'Eb G Bb');

assert.match(staffHint('treble', note('G', '', 4)), /Line 2.*→ G/);
assert.match(staffHint('treble', note('C', '', 4)), /Middle C: one ledger line below/);
assert.match(staffHint('bass', note('C', '', 4)), /Middle C: one ledger line above/);
assert.match(staffHint('bass', note('A', '', 2)), /Space 1.*→ A/);
assert.match(staffHint('bass', note('F', '', 4)), /Just above ledger line 2 \(E\) → F/);
assert.match(staffHint('treble', note('A', '', 3)), /Ledger line 2 below the staff \(they go C, A\) → A/);
// Hints name the nearest line instead of counting letters ("A → B → C → D …").
for (const [id, deck] of Object.entries(DECKS)) {
  if (!['treble', 'bass', 'grand'].includes(id)) continue;
  deck.pool(true).forEach((it) => assert.ok(!/→ \S+ →/.test(staffHint(it.clef, it.n)), `${it.id} counts letters`));
}

// Every deck builds valid questions in both difficulty modes.
for (const [id, deck] of Object.entries(DECKS)) {
  // Keyboards show whole octaves C..B so the left edge is always a recognizable C.
  if (deck.piano) assert.ok(deck.piano.lo % 12 === 0 && deck.piano.hi % 12 === 11, `${id} keyboard not C..B`);
  for (const hard of [false, true]) {
    const pool = deck.pool(hard);
    assert.ok(pool.length > 1, `${id} pool`);
    assert.strictEqual(new Set(pool.map((i) => i.id)).size, pool.length, `${id} unique ids`);
    for (const it of pool) {
      for (let k = 0; k < 4; k++) {
        const q = deck.make(it, hard);
        assert.ok(q.choices || q.keys, `${id} answerable`);
        if (q.choices) assert.ok(q.choices.includes(q.correct), `${id} ${it.id}: ${q.correct} not in ${q.choices}`);
        if (q.choices) assert.strictEqual(new Set(q.choices).size, q.choices.length, `${id} dup choices`);
        // A sharp/flat answer must not be the only sharp/flat on offer.
        const accOf = (c) => (c.includes('/') ? '/' : c.match(/[♯♭]/)?.[0] || '');
        if (['treble', 'bass', 'grand', 'pnotes'].includes(id) && q.choices) {
          assert.ok(q.choices.every((c) => accOf(c) === accOf(q.correct)), `${id} mixed accidentals: ${q.choices}`);
        }
        if (q.keys && q.exact && deck.piano) q.keys.forEach((m) => assert.ok(m >= deck.piano.lo && m <= deck.piano.hi, `${id} ${m} off piano`));
      }
    }
  }
}

// Measures fill exactly, including hard-mode syncopation groups.
for (const hard of [false, true]) {
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(Math.random() * 9);
    assert.strictEqual(MM.fillMeasure(n, hard).reduce((s, d) => s + MM.EIGHTHS[d], 0), n);
  }
}

// Chord reading is answered by name only, and covers both clefs.
const chordQs = Array.from({ length: 300 }, () => DECKS.chords.make(DECKS.chords.pool()[0], true));
assert.ok(chordQs.every((q) => !q.keys && q.choices), 'chords must not be answerable on the piano');
assert.ok(chordQs.some((q) => q.prompt.clef === 'bass') && chordQs.some((q) => q.prompt.clef === 'treble'), 'chords in both clefs');
for (const it of DECKS.chords.pool()) {
  for (let k = 0; k < 20; k++) {
    const q = DECKS.chords.make(it, true);
    const top = Math.max(...q.play);
    assert.ok(q.prompt.clef === 'bass' ? top <= 59 : top <= 83, `${it.id} too high for ${q.prompt.clef}`);
  }
}

// Hard mode actually gets harder.
const hardTreble = DECKS.treble.pool(true).length > DECKS.treble.pool(false).length;
assert.ok(hardTreble, 'hard treble adds ledger notes');
const sawInversion = Array.from({ length: 200 }, () => DECKS.chords.make(DECKS.chords.pool()[0], true))
  .some((q) => q.hint.includes('inversion'));
assert.ok(sawInversion, 'hard chords include inversions');
const sawTie = Array.from({ length: 200 }, () => DECKS.count.make({ kind: 'miss', sig: '4/4' }, true))
  .some((q) => q.prompt.notes.some((x) => x.tie));
assert.ok(sawTie, 'hard rhythm includes ties');
// Piano chords: a wrong choice must never play the same keys as the answer (F♯ / G♭, C+ / A♭+ ...).
const keySet = (c) => MM.keySet(c.notes);
const byLabel = Object.fromEntries(MM.chordPool().map((c) => [c.label, c]));
for (const it of DECKS.pchords.pool()) {
  for (let k = 0; k < 40; k++) {
    const q = DECKS.pchords.make(it, true);
    if (!q.choices) continue;
    q.choices.filter((c) => c !== q.correct).forEach((c) => assert.notStrictEqual(keySet(byLabel[c]), keySet(it), `${it.label} offers twin ${c}`));
  }
}

// Reading chords and playing chord shapes are tracked separately.
const chordIds = new Set(DECKS.chords.pool().map((i) => i.id));
assert.ok(DECKS.pchords.pool().every((i) => !chordIds.has(i.id)), 'chords and pchords share ids');

// Compound meter is felt in dotted-quarter beats, never "6 beats".
for (const sig of ['6/8', '9/8', '12/8']) {
  for (let k = 0; k < 40; k++) {
    const q = DECKS.count.make({ kind: 'sig', sig }, true);
    if (q.ask.startsWith('Which note')) assert.strictEqual(q.correct, 'Dotted quarter note', sig);
    else assert.strictEqual(q.ask, 'How many eighth notes per measure?', sig);
  }
}
// Multiple-choice options never give the answer away by their wording.
const kindOf = (label) => (/rest/.test(label) ? 'rest' : /tied/.test(label) ? 'tie' : /Dotted/.test(label) ? 'dotted' : 'note');
for (const it of DECKS.values.pool(true)) {
  for (let k = 0; k < 30; k++) {
    const q = DECKS.values.make(it, true);
    if (q.ask !== 'What is this called?') continue;
    assert.strictEqual(q.choices.length, 4, `${it.label} has ${q.choices.length} choices`);
    q.choices.forEach((c) => assert.strictEqual(kindOf(c), kindOf(q.correct), `${q.correct} offered with ${c}`));
  }
}
for (const it of DECKS.relative.pool(true)) {
  for (let k = 0; k < 20; k++) {
    const q = DECKS.relative.make(it, true);
    if (q.choices) q.choices.forEach((c) => assert.strictEqual(c.endsWith(' down'), q.correct.endsWith(' down'), `${q.correct} offered with ${c}`));
  }
}
// Content fixes from the second review.
// Every hint reads cleanly (no "undefined" in a 2/4 bar with nothing in it).
for (const [id, deck] of Object.entries(DECKS)) {
  for (const hard of [false, true]) {
    for (const it of deck.pool(hard)) {
      for (let k = 0; k < 6; k++) assert.ok(!/undefined|NaN/.test(deck.make(it, hard).hint), `${id} ${it.id} hint broken`);
    }
  }
}
// "Missing beats" options are all amounts that could be the answer.
for (const sig of ['2/4', '3/4', '4/4', '5/4']) {
  for (let k = 0; k < 60; k++) {
    const q = DECKS.count.make({ kind: 'miss', sig }, true);
    assert.ok(q.prompt.notes.length > 0, `${sig} empty bar`);
    if (q.ask === 'How many beats are missing?') q.choices.forEach((c) => assert.ok(['½', '1', '1½', '2'].includes(c), `${sig} impossible option ${c}`));
  }
}
// Never two names for the same keys in one set of choices.
const pc = (k) => ((({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[k[0]] + ({ '♯': 1, '♭': -1 }[k[1]] || 0)) + 12) % 12;
for (const hard of [false, true]) {
  for (const it of DECKS.keysig.pool(hard)) {
    for (let k = 0; k < 20; k++) {
      const q = DECKS.keysig.make(it, hard);
      if (q.ask !== 'How many sharps or flats?') assert.strictEqual(new Set(q.choices.map(pc)).size, q.choices.length, `keysig twins: ${q.choices}`);
    }
  }
  for (const it of DECKS.pchords.pool(hard)) {
    for (let k = 0; k < 10; k++) {
      const q = DECKS.pchords.make(it, hard);
      if (q.choices) assert.strictEqual(new Set(q.choices.map((c) => keySet(byLabel[c]))).size, q.choices.length, `pchords twins: ${q.choices}`);
    }
  }
}
// Normal mode: notes on ledger lines are natural.
for (const id of ['treble', 'bass', 'grand']) {
  DECKS[id].pool(false).forEach((it) => {
    const clef = it.clef === 'treble' ? 30 : 18; // diatonic step of the bottom line
    const p = it.n.oct * 7 + 'CDEFGAB'.indexOf(it.n.letter) - clef;
    if (p < 0 || p > 8) assert.strictEqual(it.n.acc, '', `${id} ${it.id} accidental on a ledger line`);
  });
}
// Ear chords stay at C3 or above, where they don't turn to mud.
for (const it of DECKS.ear.pool(true)) for (let k = 0; k < 50; k++) assert.ok(Math.min(...DECKS.ear.make(it, true).play) >= 48);
// Chord quality is really tested: at most half the chord questions can be answered from the root alone.
const rootOf = (label) => label.replace(/(m|dim|\+)$/, '');
for (const id of ['chords', 'pchords']) {
  for (const hard of [false, true]) {
    const qs = Array.from({ length: 2000 }, () => DECKS[id].make(rand(DECKS[id].pool(hard)), hard)).filter((q) => q.choices && q.ask !== 'Spell this chord');
    const byRoot = qs.filter((q) => q.choices.filter((c) => rootOf(c) === rootOf(q.correct)).length === 1).length;
    assert.ok(byRoot / qs.length <= 0.5, `${id}: ${Math.round((100 * byRoot) / qs.length)}% answerable from the root`);
  }
}

// Key signatures offer the classic wrong answers.
for (let k = 0; k < 200; k++) {
  const q = DECKS.keysig.make({ k: 'D' }, k % 2 === 0);
  if (q.ask === 'Which major key?') assert.ok(q.choices.includes('C♯ major'), `D major without the last-sharp trap: ${q.choices}`);
  if (q.ask === 'Which minor key?') assert.ok(q.choices.includes('D minor'), `B minor without the parallel minor: ${q.choices}`);
}

// Every wrong choice gets a sensible "why" line.
for (const [id, deck] of Object.entries(DECKS)) {
  for (const it of deck.pool(true)) {
    const q = deck.make(it, true);
    if (!q.why) continue;
    q.choices.filter((c) => c !== q.correct).forEach((c) => {
      const w = q.why(c);
      assert.ok(w && !/undefined|NaN/.test(w), `${id} ${it.id}: bad why for ${c}: ${w}`);
    });
  }
}
const cSharpDim = DECKS.chords.pool().find((c) => c.label === 'C♯dim');
let named;
do named = DECKS.chords.make(cSharpDim, false); while (named.ask !== 'Name this chord');
assert.strictEqual(named.why('C♯m'), 'C♯m needs G♯, not G.');

// ---------- Hard mode is really harder ----------
const many = (id, hard, n = 3000) => Array.from({ length: n }, () => DECKS[id].make(rand(DECKS[id].pool(hard)), hard));
// Playing a chord in hard mode names an inversion and checks the bass; normal mode accepts any voicing.
for (const q of many('pchords', true).filter((x) => !x.choices)) {
  assert.match(q.ask, /in (root position|1st inversion|2nd inversion)$/);
  assert.strictEqual(q.bass, q.keys[0] % 12, 'bass is the lowest key');
}
assert.ok(many('pchords', false).every((q) => q.bass === undefined), 'normal mode checks no voicing');
// Hard bars mostly have syncopation, a dotted rhythm or a tie.
const bars = many('count', true).filter((q) => q.prompt.notes?.length);
const busy = bars.filter((q) => q.prompt.notes.some((x) => x.tie || x.dur === 'qd') || /8,q,8/.test(q.prompt.notes.map((x) => x.dur).join()));
assert.ok(busy.length / bars.length >= 0.6, `only ${Math.round((100 * busy.length) / bars.length)}% of hard bars are tricky`);
// Hard piano keys show one spelling for a black key, never "C♯/D♭".
assert.ok(many('pnotes', true).every((q) => !(q.prompt.text || '').includes('/') && !(q.choices || []).some((c) => c.includes('/'))), 'hard pnotes shows a pair');
// Normal note values never name hard-mode values.
const hardNames = /tied|Dotted eighth|Sixteenth rest/;
assert.ok(many('values', false).every((q) => !(q.choices || []).some((c) => hardNames.test(c))), 'normal values shows hard names');

// ---------- New question types ----------
const asks = (id, hard) => new Set(many(id, hard, 600).map((q) => q.ask));
assert.ok(asks('chords', false).has('Spell this chord'));
assert.ok(asks('count', false).has('Which time signature fits this bar?'));
assert.ok(asks('values', false).has('Which one lasts this long? (in 4/4)'));
assert.ok(asks('keysig', false).has('How many sharps or flats?'));
for (const q of many('chords', true).filter((x) => x.ask === 'Spell this chord')) {
  const [a, b, c] = q.correct.split(' ').map((x) => 'CDEFGAB'.indexOf(x[0]));
  assert.ok((b - a + 7) % 7 === 2 && (c - b + 7) % 7 === 2, `${q.correct} skips letters wrong`);
}
const beatsOf = Object.fromEntries(DECKS.values.pool(true).map((i) => [i.v.label, i.v.beats]));
for (const q of many('values', true).filter((x) => x.ask.startsWith('Which one lasts'))) {
  assert.strictEqual(new Set(q.choices.map((c) => beatsOf[c])).size, 4, `two choices last as long: ${q.choices}`);
}
for (const q of many('count', true).filter((x) => x.ask.startsWith('Which time signature'))) {
  const eighths = q.prompt.notes.reduce((t, x) => t + MM.EIGHTHS[x.dur], 0);
  assert.strictEqual(eighths, +q.correct[0] * 2, `bar doesn't fill ${q.correct}`);
}

console.log('theory ok');
