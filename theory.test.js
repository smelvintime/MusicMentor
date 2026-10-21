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
// Chord quality is really tested: at most half the chord questions can be answered from the root alone.
const rootOf = (label) => label.replace(/(m|dim|\+)$/, '');
for (const id of ['chords', 'pchords']) {
  for (const hard of [false, true]) {
    const qs = Array.from({ length: 2000 }, () => DECKS[id].make(rand(DECKS[id].pool(hard)), hard)).filter((q) => q.choices);
    const byRoot = qs.filter((q) => q.choices.filter((c) => rootOf(c) === rootOf(q.correct)).length === 1).length;
    assert.ok(byRoot / qs.length <= 0.5, `${id}: ${Math.round((100 * byRoot) / qs.length)}% answerable from the root`);
  }
}

// Key signatures offer the classic wrong answers.
for (let k = 0; k < 200; k++) {
  const q = DECKS.keysig.make({ k: 'D' }, k % 2 === 0);
  if (q.ask === 'Which major key?') assert.ok(q.choices.includes('C♯ major'), `D major without the last-sharp trap: ${q.choices}`);
  else assert.ok(q.choices.includes('D minor'), `B minor without the parallel minor: ${q.choices}`);
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
assert.strictEqual(DECKS.chords.make(DECKS.chords.pool().find((c) => c.label === 'C♯dim'), false).why('C♯m'), 'C♯m needs G♯, not G.');

console.log('theory ok');
