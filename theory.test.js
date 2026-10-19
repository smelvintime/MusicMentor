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
  for (const [adv, hard] of [[false, false], [true, false], [true, true]]) {
    const pool = deck.pool(adv, hard);
    assert.ok(pool.length > 1, `${id} pool`);
    assert.strictEqual(new Set(pool.map((i) => i.id)).size, pool.length, `${id} unique ids`);
    for (const it of pool) {
      for (let k = 0; k < 4; k++) {
        const q = deck.make(it, adv, hard);
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
    assert.strictEqual(MM.fillMeasure(n, true, hard).reduce((s, d) => s + MM.EIGHTHS[d], 0), n);
  }
}

// Hard mode actually gets harder.
const hardTreble = DECKS.treble.pool(true, true).length > DECKS.treble.pool(true, false).length;
assert.ok(hardTreble, 'hard treble adds ledger notes');
const sawInversion = Array.from({ length: 200 }, () => DECKS.chords.make(DECKS.chords.pool(true)[0], true, true))
  .some((q) => q.hint.includes('inversion'));
assert.ok(sawInversion, 'hard chords include inversions');
const sawTie = Array.from({ length: 200 }, () => DECKS.count.make({ kind: 'miss', sig: '4/4' }, true, true))
  .some((q) => q.prompt.notes.some((x) => x.tie));
assert.ok(sawTie, 'hard rhythm includes ties');
console.log('theory ok');
