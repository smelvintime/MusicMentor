// Run: node theory.test.js
const assert = require('assert');
const MM = require('./theory.js');
const { note, midi, triad, staffHint, DECKS } = MM;

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
assert.match(staffHint('treble', note('C', '', 4)), /1 ledger line below.*E → D → C.*Middle C/);
assert.match(staffHint('bass', note('C', '', 4)), /1 ledger line above.*A → B → C/);
assert.match(staffHint('bass', note('A', '', 2)), /Space 1.*→ A/);

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
    q.choices.forEach((c) => assert.ok(['½', '1', '1½', '2'].includes(c), `${sig} impossible option ${c}`));
  }
}
// Never two names for the same keys in one set of choices.
const pc = (k) => ((({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[k[0]] + ({ '♯': 1, '♭': -1 }[k[1]] || 0)) + 12) % 12;
for (const hard of [false, true]) {
  for (const it of DECKS.keysig.pool(hard)) {
    for (let k = 0; k < 20; k++) {
      const q = DECKS.keysig.make(it, hard);
      assert.strictEqual(new Set(q.choices.map(pc)).size, q.choices.length, `keysig twins: ${q.choices}`);
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
console.log('theory ok');
