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
  for (const adv of [false, true]) {
    const pool = deck.pool(adv);
    assert.ok(pool.length > 1, `${id} pool`);
    assert.strictEqual(new Set(pool.map((i) => i.id)).size, pool.length, `${id} unique ids`);
    for (const it of pool) {
      for (let k = 0; k < 4; k++) {
        const q = deck.make(it, adv);
        assert.ok(q.choices || q.keys, `${id} answerable`);
        if (q.choices) assert.ok(q.choices.includes(q.correct), `${id} ${it.id}: ${q.correct} not in ${q.choices}`);
        if (q.choices) assert.strictEqual(new Set(q.choices).size, q.choices.length, `${id} dup choices`);
        if (q.keys && q.exact && deck.piano) q.keys.forEach((m) => assert.ok(m >= deck.piano.lo && m <= deck.piano.hi, `${id} ${m} off piano`));
      }
    }
  }
}

// Measures fill exactly.
for (let i = 0; i < 200; i++) {
  const n = 1 + Math.floor(Math.random() * 7);
  assert.strictEqual(MM.fillMeasure(n, true).reduce((s, d) => s + MM.EIGHTHS[d], 0), n);
}
console.log('theory ok');
