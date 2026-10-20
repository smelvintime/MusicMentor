// Run: node metronome.test.js
const assert = require('assert');
const MET = require('./metronome.js');

assert.strictEqual(MET.clampBpm(5), MET.MIN);
assert.strictEqual(MET.clampBpm(999), MET.MAX);
assert.strictEqual(MET.tempoName(50), 'Largo');
assert.strictEqual(MET.tempoName(120), 'Allegro');
assert.strictEqual(MET.tempoName(250), 'Prestissimo');

// Subdivisions start on the beat and stay inside it.
for (const [id, s] of Object.entries(MET.SUBDIVISIONS)) {
  assert.strictEqual(s.at[0], 0, id);
  assert.ok(s.at.every((x, i) => x < 1 && (i === 0 || x > s.at[i - 1])), id);
}

// Accent tapping visits every level and comes back.
let lvl = 1;
const seen = new Set();
for (let i = 0; i < 4; i++) { seen.add(lvl); lvl = MET.cycleAccent(lvl); }
assert.deepStrictEqual([...seen].sort(), [0, 1, 2, 3]);
assert.strictEqual(lvl, 1);

// Meters open on a strong beat and are recognized back from their accents.
for (const [m, acc] of Object.entries(MET.METERS)) {
  assert.strictEqual(acc[0], 3, m);
  assert.strictEqual(MET.meterOf(acc), m);
}
assert.deepStrictEqual(MET.resize([3, 2, 0], 5), [3, 2, 0, 1, 1]);
assert.deepStrictEqual(MET.resize([3, 2, 0], 2), [3, 2]);
assert.deepStrictEqual(MET.resize([], 2), [3, 1]);

// Tap tempo: steady 500ms taps = 120 BPM; a long pause restarts the count.
assert.strictEqual(MET.tapTempo([1000]), null);
assert.strictEqual(MET.tapTempo([0, 500, 1000, 1500]), 120);
assert.strictEqual(MET.tapTempo([0, 1000, 5000, 5600]), 100);
assert.strictEqual(MET.tapTempo([0, 9000]), null);

// Old or partial saved settings still load into a valid state.
const m = MET.merge({ bpm: 7, beats: 3, sub: 'nope', speed: { on: true } });
assert.strictEqual(m.bpm, MET.MIN);
assert.strictEqual(m.sub, 'quarter');
assert.strictEqual(m.accents.length, 3);
assert.ok(!('speed' in m), 'removed settings are dropped');
assert.deepStrictEqual(MET.merge(undefined), MET.defaults());
console.log('metronome ok');
