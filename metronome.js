// Pure metronome logic: tempo, meters, accents, subdivisions, trainers. No DOM. `node metronome.test.js` checks it.
const MET = (() => {
  const MIN = 20;
  const MAX = 300;
  const clampBpm = (b) => Math.min(MAX, Math.max(MIN, Math.round(b)));

  // Upper bound (exclusive) for each traditional tempo marking.
  const TEMPOS = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'],
    [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo']];
  const tempoName = (bpm) => TEMPOS.find(([hi]) => bpm < hi)[1];

  // Where each click falls inside one beat, as a fraction of the beat.
  const SUBDIVISIONS = {
    quarter: { label: 'None', at: [0] },
    eighth: { label: '8ths', at: [0, 1 / 2] },
    triplet: { label: 'Triplets', at: [0, 1 / 3, 2 / 3] },
    sixteenth: { label: '16ths', at: [0, 1 / 4, 1 / 2, 3 / 4] },
    swing: { label: 'Swing', at: [0, 2 / 3] }, // long-short, the middle triplet left out
  };

  // Accent levels: 3 strong, 2 medium, 1 normal, 0 silent. Tapping a beat steps through them.
  const ACCENT_CYCLE = { 1: 2, 2: 3, 3: 0, 0: 1 };
  const cycleAccent = (level) => ACCENT_CYCLE[level] ?? 1;

  // Common meters with their natural accent groupings (5/4 = 3 + 2, 7/8 = 2 + 2 + 3).
  const METERS = {
    '2/4': [3, 1],
    '3/4': [3, 1, 1],
    '4/4': [3, 1, 1, 1],
    '5/4': [3, 1, 1, 2, 1],
    '6/8': [3, 1, 1, 2, 1, 1],
    '7/8': [3, 1, 2, 1, 2, 1, 1],
    '12/8': [3, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1],
  };
  const meterOf = (accents) => Object.keys(METERS).find((m) => METERS[m].join() === accents.join()) || null;

  // Change the number of beats, keeping the accents already set. New beats are normal.
  function resize(accents, n) {
    const out = accents.slice(0, n);
    while (out.length < n) out.push(out.length ? 1 : 3);
    return out;
  }

  // Tap tempo: average the gaps between the last few taps (ms timestamps, oldest first).
  // A pause of 2s or more starts a fresh count. Needs at least two taps.
  function tapTempo(times) {
    const recent = [times.at(-1)];
    for (let i = times.length - 2; i >= 0 && recent.length < 6; i--) {
      if (recent[0] - times[i] >= 2000) break;
      recent.unshift(times[i]);
    }
    if (recent.length < 2) return null;
    return clampBpm((60000 * (recent.length - 1)) / (recent.at(-1) - recent[0]));
  }

  // Speed trainer: from `start`, move `step` BPM toward `target` after every `every` bars.
  function trainerBpm(start, { step, every, target }, bars) {
    const moved = Math.floor(bars / every) * step;
    const dist = target - start;
    return clampBpm(start + Math.sign(dist) * Math.min(moved, Math.abs(dist)));
  }

  // Gap trainer: play `play` bars, then `mute` bars of silence, repeating. Keep the time in your head.
  const gapSilent = ({ play, mute }, bar) => bar % (play + mute) >= play;

  const defaults = () => ({
    bpm: 100, beats: 4, accents: [...METERS['4/4']], sub: 'quarter', sound: 'click', look: 'count',
    speed: { on: false, step: 5, every: 4, target: 140 },
    gap: { on: false, play: 2, mute: 2 },
  });
  // Saved settings over the defaults, so settings added later still get a value.
  function merge(saved = {}) {
    const d = defaults();
    const m = { ...d, ...saved, speed: { ...d.speed, ...saved.speed }, gap: { ...d.gap, ...saved.gap } };
    if (!SUBDIVISIONS[m.sub]) m.sub = d.sub;
    m.bpm = clampBpm(m.bpm);
    m.accents = resize(Array.isArray(m.accents) ? m.accents : d.accents, m.beats);
    return m;
  }

  return { MIN, MAX, clampBpm, tempoName, SUBDIVISIONS, cycleAccent, METERS, meterOf, resize, tapTempo, trainerBpm, gapSilent, defaults, merge };
})();

if (typeof module !== 'undefined') module.exports = MET;
