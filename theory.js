// Pure music-theory logic + deck definitions. No DOM. `node theory.test.js` checks it.
const MM = (() => {
  const LETTERS = 'CDEFGAB';
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC = { '': 0, '#': 1, b: -1 };
  const SYM = { '': '', '#': '♯', b: '♭' };
  const BLACK_NAMES = { 1: 'C♯/D♭', 3: 'D♯/E♭', 6: 'F♯/G♭', 8: 'G♯/A♭', 10: 'A♯/B♭' };

  const note = (letter, acc, oct) => ({ letter, acc, oct });
  const midi = (n) => 12 * (n.oct + 1) + PC[n.letter] + ACC[n.acc];
  const dia = (n) => n.oct * 7 + LETTERS.indexOf(n.letter);
  const fromDia = (d, acc = '') => note(LETTERS[((d % 7) + 7) % 7], acc, Math.floor(d / 7));
  const name = (n) => n.letter + SYM[n.acc];
  const vex = (n) => `${n.letter.toLowerCase()}${n.acc}/${n.oct}`;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  const pcName = (m) => BLACK_NAMES[m % 12] || LETTERS[[0, 2, 4, 5, 7, 9, 11].indexOf(m % 12)];
  // Spellings nobody wants a beginner to see.
  const ODD = ['E#', 'B#', 'Fb', 'Cb'];

  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const pickRandom = (correct, pool, n = 4) => shuffle([correct, ...shuffle(pool).filter((d) => d !== correct).slice(0, n - 1)]);

  // ---------- Staff ----------
  const CLEFS = {
    treble: { bottom: 30, lines: 'EGBDF', spaces: 'FACE', lineTip: 'Every Good Boy Does Fine', spaceTip: 'spells FACE' },
    bass: { bottom: 18, lines: 'GBDFA', spaces: 'ACEG', lineTip: 'Good Boys Do Fine Always', spaceTip: 'All Cows Eat Grass' },
  };

  function staffHint(clef, n) {
    const c = CLEFS[clef];
    const p = dia(n) - c.bottom;
    const accTip = n.acc ? ` ${SYM[n.acc]} ${n.acc === '#' ? 'raises' : 'lowers'} it a half step → ${name(n)}.` : '';
    const midC = n.letter === 'C' && n.oct === 4 ? ' (Middle C)' : '';
    if (p >= 0 && p <= 8) {
      const where = p % 2 === 0
        ? `Line ${p / 2 + 1} from the bottom. Lines: ${c.lines.split('').join(' ')} — "${c.lineTip}".`
        : `Space ${(p + 1) / 2} from the bottom. Spaces: ${c.spaces.split('').join(' ')} — ${c.spaceTip}.`;
      return `${where} → ${n.letter}${midC}.${accTip}`;
    }
    const below = p < 0;
    const edge = below ? 0 : 8;
    const steps = Math.abs(p - edge);
    const seq = Array.from({ length: steps + 1 }, (_, i) => fromDia(c.bottom + edge + (below ? -i : i)).letter);
    const ledgers = Math.floor(steps / 2);
    const lead = ledgers
      ? `${ledgers} ledger line${ledgers > 1 ? 's' : ''} ${below ? 'below' : 'above'} the staff.`
      : `Just ${below ? 'below' : 'above'} the staff.`;
    return `${lead} Count from the ${below ? 'bottom' : 'top'} line: ${seq.join(' → ')}${midC}.${accTip}`;
  }

  function staffPool(clef, lo, hi) {
    const items = [];
    for (let p = lo; p <= hi; p++) {
      const base = fromDia(CLEFS[clef].bottom + p);
      for (const acc of ['', '#', 'b']) {
        const n = { ...base, acc };
        if (ODD.includes(n.letter + acc)) continue;
        items.push({ id: `${clef}:${vex(n)}`, clef, n, label: `${name(n)}${n.oct}` });
      }
    }
    return items;
  }

  // Every option shares the answer's accidental, in letter order, so spotting the
  // ♯/♭ never gives the answer away: you still have to read the line or space.
  const sameAccidentalRow = (acc) =>
    LETTERS.split('').filter((l) => !ODD.includes(l + acc)).map((l) => l + SYM[acc]);

  function staffNoteQuestion(it) {
    const { clef, n } = it;
    return {
      prompt: { type: 'staff', clef, notes: [{ keys: [vex(n)], accs: [n.acc], dur: 'w' }] },
      ask: 'Name this note',
      choices: sameAccidentalRow(n.acc),
      correct: name(n),
      keys: [midi(n)],
      exact: true,
      hint: staffHint(clef, n),
      play: [midi(n)],
    };
  }

  // ---------- Chords ----------
  const QUAL = {
    maj: { st: [4, 7], sfx: '', label: 'Major', tip: 'root + 4 half steps + 3 more. Sounds bright and settled' },
    min: { st: [3, 7], sfx: 'm', label: 'Minor', tip: 'root + 3 half steps + 4 more. Sounds darker or sad, but still at rest' },
    dim: { st: [3, 6], sfx: 'dim', label: 'Diminished', tip: 'root + 3 + 3 half steps, a minor chord with the top squeezed down. Sounds tense and uneasy, like it has to move on' },
    aug: { st: [4, 8], sfx: '+', label: 'Augmented', tip: 'root + 4 + 4 half steps, a major chord with the top pushed up. Sounds dreamy and suspended, like an unanswered question' },
  };

  // Shared chord-quality lesson: what each is, how it sounds, what to listen for.
  const CHORD_GUIDE = [
    '<b>Major</b> (C = C E G): 4 + 3 half steps. Bright, happy, finished. <i>Listen for:</i> nothing pulling — it feels like home.',
    '<b>Minor</b> (Cm = C E♭ G): 3 + 4 half steps. Only the middle note drops. Darker or sad, but still calm. <i>Listen for:</i> a shadow over the same "at home" feeling.',
    '<b>Diminished</b> (Cdim = C E♭ G♭): 3 + 3 half steps — a minor chord with the top note squeezed down. Tense, uneasy, spooky. <i>Listen for:</i> a clash between the bottom and top notes, and an itch to move to another chord.',
    '<b>Augmented</b> (C+ = C E G♯): 4 + 4 half steps — a major chord with the top note pushed up. Dreamy, floating, suspenseful (think movie dream sequence). <i>Listen for:</i> a top note that feels stretched too high, like a question with no answer.',
    'Quick test: Major and minor feel <b>at rest</b>. Diminished and augmented feel <b>unfinished</b> — diminished pulls inward, augmented floats outward.',
  ];
  // Tap-to-hear examples on the lesson sheet, all built on C4.
  const CHORD_EXAMPLES = [
    { label: 'C major', notes: 'C E G', keys: [60, 64, 67] },
    { label: 'C minor', notes: 'C E♭ G', keys: [60, 63, 67] },
    { label: 'C diminished', notes: 'C E♭ G♭', keys: [60, 63, 66] },
    { label: 'C augmented', notes: 'C E G♯', keys: [60, 64, 68] },
  ];

  function triad(root, q) {
    const r = midi(root);
    const thirds = [2, 4].map((step, i) => {
      const base = fromDia(dia(root) + step);
      const diff = r + QUAL[q].st[i] - midi(base);
      return { ...base, acc: { 0: '', 1: '#', '-1': 'b' }[diff] };
    });
    const notes = [root, ...thirds];
    return notes.every((n) => n.acc !== undefined && !ODD.includes(n.letter + n.acc)) ? notes : null;
  }

  function chordPool() {
    const items = [];
    for (const letter of LETTERS) {
      for (const acc of ['', '#', 'b']) {
        for (const q of ['maj', 'min', 'dim', 'aug']) {
          const root = note(letter, acc, 4);
          if (ODD.includes(letter + acc)) continue;
          const notes = triad(root, q);
          if (notes) items.push({ id: `chord:${letter}${acc}${q}`, q, notes, label: name(root) + QUAL[q].sfx });
        }
      }
    }
    return items;
  }

  const INVERSION_TIP = [
    'Root position: the bottom note is the root.',
    '1st inversion: the root moved to the top. The root is the note just above the biggest gap.',
    '2nd inversion: the root is in the middle, just above the biggest gap.',
  ];
  const chordHint = (it, inv = 0) =>
    `${it.label} = ${it.notes.map(name).join(' – ')}. ${QUAL[it.q].label}: ${QUAL[it.q].tip}. ${INVERSION_TIP[inv]}`;

  const octave = (notes, by) => notes.map((n) => ({ ...n, oct: n.oct + by }));

  // Hard mode: move the bottom note up an octave `k` times, then drop the
  // whole chord an octave at a time until its top note is at or below `max`.
  function invert(notes, k, max = 83) {
    let v = notes;
    for (let i = 0; i < k; i++) v = [...v.slice(1), { ...v[0], oct: v[0].oct + 1 }];
    while (midi(v.at(-1)) > max) v = octave(v, -1);
    return v;
  }

  // Read-only: answered by naming it, never on the piano. Half the chords are in bass clef.
  function chordStaffQuestion(it, hard) {
    const inv = hard ? rand([0, 1, 2]) : 0;
    const clef = rand(['treble', 'bass']);
    // Bass chords stay on the bass staff: top note no higher than B3 (just above the top line).
    const notes = clef === 'bass' ? invert(octave(it.notes, -1), inv, 59) : invert(it.notes, inv);
    const clefTip = clef === 'bass' ? 'Bass clef: lines G B D F A, spaces A C E G. ' : '';
    return {
      prompt: { type: 'staff', clef, notes: [{ keys: notes.map(vex), accs: notes.map((n) => n.acc), dur: 'w' }] },
      ask: 'Name this chord',
      choices: pickRandom(it.label, chordPool().map((c) => c.label)),
      correct: it.label,
      hint: clefTip + chordHint(it, inv),
      play: notes.map(midi),
    };
  }

  // Same keys, different name (F♯ / G♭, C+ / E+ / A♭+): the keyboard can't tell them apart.
  const keySet = (notes) => [...new Set(notes.map((n) => ((midi(n) % 12) + 12) % 12))].sort((a, b) => a - b).join();

  function chordPianoQuestion(it, hard) {
    const inv = hard ? rand([0, 1, 2]) : 0;
    const keys = invert(it.notes, inv).map(midi);
    if (Math.random() < 0.5) {
      // A twin would be another right answer, so it is never offered as a wrong one.
      const others = chordPool().filter((c) => keySet(c.notes) !== keySet(it.notes));
      return {
        prompt: { type: 'piano', highlight: keys },
        ask: 'Which chord is this?',
        choices: pickRandom(it.label, others.map((c) => c.label)),
        correct: it.label,
        hint: chordHint(it, inv),
        play: keys,
      };
    }
    return {
      prompt: { type: 'text', text: it.label },
      ask: 'Play this chord',
      keys,
      exact: false,
      hint: chordHint(it),
      play: keys,
    };
  }

  // ---------- Piano notes ----------
  const pianoNotePool = () => Array.from({ length: 12 }, (_, i) => ({ id: `pkey:${60 + i}`, m: 60 + i, label: pcName(60 + i) }));

  // Hard mode spellings that land on a white key.
  const ODD_SPELLING = { 0: 'B♯', 4: 'F♭', 5: 'E♯', 11: 'C♭' };

  function pianoNoteQuestion(it, hard) {
    const m = it.m + (Math.random() < 0.5 ? 0 : 12); // either octave
    if (hard && ODD_SPELLING[m % 12] && Math.random() < 0.5) {
      const odd = ODD_SPELLING[m % 12];
      const hint = `${odd} is just ${pcName(m)}: a sharp is always the very next key up and a flat the very next key down — even when that key is white.`;
      return { prompt: { type: 'text', text: odd }, ask: 'Tap this key', keys: [m], exact: false, hint, play: [m] };
    }
    const nm = pcName(m);
    const hint = isBlack(m)
      ? `Black keys come in groups of 2 and 3. ${nm}: a sharp is the key just right of a white key, a flat just left.`
      : `C is the white key just left of each group of 2 black keys. Count up from C: C D E F G A B → ${nm}.`;
    if (Math.random() < 0.5) {
      return {
        prompt: { type: 'piano', highlight: [m] },
        ask: 'Name this key',
        choices: isBlack(m) ? Object.values(BLACK_NAMES) : LETTERS.split(''),
        correct: nm,
        hint,
        play: [m],
      };
    }
    return { prompt: { type: 'text', text: nm }, ask: 'Tap this key', keys: [m], exact: false, hint, play: [m] };
  }

  // ---------- Rhythm ----------
  const VALUES = [
    { dur: 'w', beats: '4', label: 'Whole note' },
    { dur: 'h', beats: '2', label: 'Half note' },
    { dur: 'q', beats: '1', label: 'Quarter note' },
    { dur: '8', beats: '½', label: 'Eighth note' },
    { dur: '16', beats: '¼', label: 'Sixteenth note' },
    { dur: 'hd', beats: '3', label: 'Dotted half note' },
    { dur: 'qd', beats: '1½', label: 'Dotted quarter note' },
    { dur: 'wr', beats: '4', label: 'Whole rest' },
    { dur: 'hr', beats: '2', label: 'Half rest' },
    { dur: 'qr', beats: '1', label: 'Quarter rest' },
    { dur: '8r', beats: '½', label: 'Eighth rest' },
  ];
  const VALUES_HARD = [
    { dur: '8d', beats: '¾', label: 'Dotted eighth note' },
    { dur: '16r', beats: '¼', label: 'Sixteenth rest' },
    { dur: 'h', tie: 'q', beats: '3', label: 'Half tied to quarter' },
    { dur: 'q', tie: '8', beats: '1½', label: 'Quarter tied to eighth' },
    { dur: 'h', tie: 'h', beats: '4', label: 'Half tied to half' },
    { dur: 'q', tie: 'q', beats: '2', label: 'Quarter tied to quarter' },
  ];
  const BEATS = ['4', '3', '2', '1½', '1', '¾', '½', '¼'];
  const VALUE_TIPS = {
    w: 'Hollow head, no stem = 4 beats.', h: 'Hollow head with a stem = 2 beats.', q: 'Filled head with a stem = 1 beat.',
    8: 'One flag (or beam) halves a quarter = ½ beat.', 16: 'Two flags = ¼ beat.',
    hd: 'A dot adds half the value: 2 + 1 = 3 beats.', qd: 'A dot adds half the value: 1 + ½ = 1½ beats.',
    wr: 'Whole rest hangs DOWN from line 4 (heavy, it fell) = 4 beats.', hr: 'Half rest sits ON line 3 like a hat = 2 beats.',
    qr: 'The squiggle = 1 beat of silence.', '8r': 'One flag-like hook = ½ beat of silence.',
    '8d': 'A dot adds half the value: ½ + ¼ = ¾ beat.', '16r': 'Two flag-like hooks = ¼ beat of silence.',
    tie: 'A tie (curved line) joins two notes of the same pitch into one long sound: add their beats together.',
  };

  const valueKind = (v) => (v.dur.includes('r') ? 'rest' : v.tie ? 'tie' : v.dur.includes('d') ? 'dotted' : 'note');
  // Wrong-answer names only, so the smaller kinds still fill four options.
  const VALUE_LURES = [
    { dur: 'wd', label: 'Dotted whole note' }, { dur: '16d', label: 'Dotted sixteenth note' },
    { dur: 'q', tie: 'h', label: 'Quarter tied to half' }, { dur: '8', tie: '8', label: 'Eighth tied to eighth' },
  ];

  function valueQuestion(it) {
    const v = it.v;
    const rest = v.dur.includes('r');
    const first = { keys: [v.dur === 'wr' ? 'd/5' : 'b/4'], dur: v.dur, tie: !!v.tie };
    const prompt = { type: 'staff', clef: null, notes: v.tie ? [first, { keys: ['b/4'], dur: v.tie }] : [first] };
    const hint = `${v.label}. ${VALUE_TIPS[v.tie ? 'tie' : v.dur]}`;
    if (Math.random() < 0.5) {
      return { prompt, ask: 'How many beats? (in 4/4)', choices: pickRandom(v.beats, BEATS), correct: v.beats, hint };
    }
    // Every option is the same kind as the answer (all ties, all dotted...), so the wording never gives it away.
    const pool = [...VALUES, ...VALUES_HARD, ...VALUE_LURES].filter((x) => valueKind(x) === valueKind(v)).map((x) => x.label);
    return { prompt, ask: 'What is this called?', choices: pickRandom(v.label, pool), correct: v.label, hint };
  }

  const FRAC = { 1: '½', 2: '1', 3: '1½', 4: '2', 5: '2½', 6: '3', 7: '3½', 8: '4', 9: '4½', 10: '5' };
  const EIGHTHS = { h: 4, q: 2, 8: 1, hd: 6, qd: 3, qr: 2 };
  // Hard mode rhythm groups: syncopation (short-long-short) and dotted-quarter + eighth.
  const GROUPS = { syn: ['8', 'q', '8'], dot: ['qd', '8'] };

  function fillMeasure(eighths, hard) {
    const out = [];
    let rem = eighths;
    while (rem > 0) {
      const opts = ['h', 'q', 'q', 'qr', '8', 'hd', ...(hard ? ['syn', 'syn', 'dot'] : [])]
        .filter((d) => (GROUPS[d] ? 4 : EIGHTHS[d]) <= rem);
      const d = rand(opts);
      if (GROUPS[d]) { out.push(...GROUPS[d]); rem -= 4; }
      // keep eighths in beamable pairs
      else if (d === '8' && rem >= 2) { out.push(d, d); rem -= 2; } else { out.push(d); rem -= EIGHTHS[d]; }
    }
    return out;
  }

  function countQuestion(it, hard) {
    if (it.kind === 'sig') {
      const [top, bottom] = it.sig.split('/');
      const unit = { 2: 'Half note', 4: 'Quarter note', 8: 'Eighth note' }[bottom];
      const prompt = { type: 'staff', clef: 'treble', timeSig: it.sig, notes: [] };
      const beatChoices = ['Half note', 'Quarter note', 'Eighth note', 'Dotted quarter note'];
      // Compound meter (6/8, 9/8, 12/8): eighth notes grouped in threes, so the beat is a dotted quarter.
      if (bottom === '8' && top % 3 === 0 && top > 3) {
        const beats = String(top / 3);
        const hint = `${it.sig} is compound time: ${top} eighth notes grouped in threes, felt as ${beats} dotted-quarter beats.`;
        return Math.random() < 0.5
          ? { prompt, ask: 'How many eighth notes per measure?', choices: pickRandom(top, ['3', '4', '6', '8', '9', '12']), correct: top, hint }
          : { prompt, ask: 'Which note gets one beat?', choices: beatChoices, correct: 'Dotted quarter note', hint };
      }
      const hint = `Top number = beats per measure (${top}). Bottom number = which note gets one beat (${bottom} → ${unit.toLowerCase()}).`;
      return Math.random() < 0.5
        ? { prompt, ask: 'How many beats per measure?', choices: pickRandom(top, ['2', '3', '4', '5', '6', '7', '8', '9', '12']), correct: top, hint }
        : { prompt, ask: 'Which note gets one beat?', choices: beatChoices, correct: unit, hint };
    }
    const top = +it.sig[0];
    const missing = rand([1, 2, 3, 4]);
    const durs = fillMeasure(top * 2 - missing, hard);
    const notes = durs.map((d) => ({ keys: [d === 'qr' ? 'b/4' : rand(['g/4', 'a/4', 'b/4', 'c/5', 'd/5'])], dur: d }));
    // Hard mode: tie some neighbouring notes. Ties don't change the count, they just make it harder to read.
    if (hard) {
      notes.forEach((x, i) => {
        const nx = notes[i + 1];
        if (nx && !x.dur.includes('r') && !nx.dur.includes('r') && Math.random() < 0.35) {
          x.tie = true;
          nx.keys = x.keys;
        }
      });
    }
    const tieTip = notes.some((x) => x.tie) ? ' Ties join notes but each note still counts its own beats.' : '';
    const counted = durs.map((d) => FRAC[EIGHTHS[d]]).join(' + ');
    return {
      prompt: { type: 'staff', clef: 'treble', timeSig: it.sig, notes },
      ask: 'How many beats are missing?',
      choices: pickRandom(FRAC[missing], ['½', '1', '1½', '2', '3']),
      correct: FRAC[missing],
      hint: `${it.sig} needs ${top} beats. You see ${counted} = ${FRAC[top * 2 - missing]}. Missing ${FRAC[missing]}.${tieTip}`,
    };
  }

  // ---------- Key signatures ----------
  const SHARPS = 'FCGDAEB';
  const FLATS = 'BEADGCF';
  const KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  const keyName = (k) => k.replace('#', '♯').replace('b', '♭') + ' major';
  // Relative minor = 3 half steps below the major key; same key signature.
  const REL_MINOR = { C: 'A', G: 'E', D: 'B', A: 'F♯', E: 'C♯', B: 'G♯', 'F#': 'D♯', 'C#': 'A♯', F: 'D', Bb: 'G', Eb: 'C', Ab: 'F', Db: 'B♭', Gb: 'E♭', Cb: 'A♭' };
  const minorName = (k) => `${REL_MINOR[k]} minor`;

  function keySigQuestion(it, hard) {
    const n = KEYS[it.k];
    const list = (n > 0 ? SHARPS : FLATS).slice(0, Math.abs(n)).split('').map((l) => l + (n > 0 ? '♯' : '♭'));
    let hint = 'No sharps or flats = C major.';
    if (n > 0) hint = `Sharps: ${list.join(' ')}. Last sharp (${list.at(-1)}) + a half step up = ${keyName(it.k)}. Order: Father Charles Goes Down And Ends Battle.`;
    if (n === -1) hint = 'One flat (B♭) = F major — memorize this one.';
    if (n < -1) hint = `Flats: ${list.join(' ')}. The second-to-last flat (${list.at(-2)}) names the key → ${keyName(it.k)}.`;
    const prompt = { type: 'staff', clef: 'treble', keySig: it.k, notes: [] };
    if (hard && Math.random() < 0.5) {
      return {
        prompt,
        ask: 'Which minor key?',
        choices: pickRandom(minorName(it.k), Object.keys(REL_MINOR).map(minorName)),
        correct: minorName(it.k),
        hint: `${hint} Its relative minor is 3 half steps down: ${minorName(it.k)}.`,
      };
    }
    return {
      prompt,
      ask: 'Which major key?',
      choices: pickRandom(keyName(it.k), keySigPool().map((x) => keyName(x.k))),
      correct: keyName(it.k),
      hint,
    };
  }
  const keySigPool = () =>
    Object.keys(KEYS).map((k) => ({ id: `key:${k}`, k, label: keyName(k) }));

  // ---------- Ear ----------
  function earQuestion(it, hard) {
    const r = (hard ? 40 : 48) + Math.floor(Math.random() * (hard ? 24 : 12));
    let keys = [r, r + QUAL[it.q].st[0], r + QUAL[it.q].st[1]];
    if (hard) for (let i = rand([0, 1, 2]); i > 0; i--) keys = [...keys.slice(1), keys[0] + 12]; // inversion
    const labels = ['maj', 'min', 'dim', 'aug'].map((q) => QUAL[q].label);
    return {
      prompt: { type: 'ear' },
      ask: 'Which chord type? (tap card to replay)',
      choices: labels,
      correct: QUAL[it.q].label,
      hint: `${QUAL[it.q].label}: ${QUAL[it.q].tip}.`,
      play: keys,
      autoplay: true,
    };
  }

  // ---------- Pitch (by ear) ----------
  const WHITE_C4 = [60, 62, 64, 65, 67, 69, 71];
  const NOTE_GAP = 0.7; // seconds between the two notes of an interval

  function perfectPitchQuestion(it, hard) {
    const m = 12 * (hard ? rand([4, 5, 6]) : 5) + it.pc; // normal: C4–B4; hard: C3–B5
    return {
      prompt: { type: 'ear' },
      ask: 'Which note is this? (tap card to replay)',
      keys: [m],
      exact: false,
      hint: `That was ${pcName(m)}. Tap the card to hear it again and hold it in your head next to the key you picked.`,
      play: [m],
      autoplay: true,
    };
  }

  // [name, a song whose first two notes make this interval going up]
  const INTERVALS = {
    1: ['Minor 2nd', 'Jaws'], 2: ['Major 2nd', 'Frère Jacques'], 3: ['Minor 3rd', 'Greensleeves'],
    4: ['Major 3rd', 'When the Saints Go Marching In'], 5: ['Perfect 4th', 'Here Comes the Bride'],
    6: ['Tritone', 'The Simpsons theme'], 7: ['Perfect 5th', 'Twinkle Twinkle Little Star'],
    8: ['Minor 6th', 'The Entertainer (3rd to 4th note)'], 9: ['Major 6th', 'My Bonnie Lies Over the Ocean'],
    10: ['Minor 7th', 'Star Trek theme'], 11: ['Major 7th', 'Take On Me (chorus)'], 12: ['Octave', 'Somewhere Over the Rainbow'],
  };

  // Songs whose first two notes make the interval going DOWN (hard mode).
  const DOWN_SONGS = {
    1: 'Für Elise', 2: 'Mary Had a Little Lamb', 3: 'Hey Jude', 4: 'Swing Low, Sweet Chariot',
    5: 'Eine kleine Nachtmusik (2nd to 3rd note)', 7: 'The Flintstones',
  };

  function intervalPool(hard) {
    const steps = hard ? Object.keys(INTERVALS).map(Number) : [1, 2, 3, 4, 5, 7, 12];
    const up = steps.map((st) => ({ id: `int:${st}`, st, label: INTERVALS[st][0] }));
    const down = hard ? steps.map((st) => ({ id: `int:-${st}`, st: -st, label: `${INTERVALS[st][0]} down` })) : [];
    return [...up, ...down];
  }

  function relativePitchQuestion(it, hard) {
    const size = Math.abs(it.st);
    const a = rand(WHITE_C4) + (it.st < 0 ? 12 : 0); // both notes stay within C4–B5
    const b = a + it.st;
    const [label, song] = INTERVALS[size];
    const down = DOWN_SONGS[size];
    const tip = it.st > 0 ? `Think "${song}".` : down ? `Think "${down}".` : `Same distance as "${song}", just downward.`;
    const hint = `${label}${it.st < 0 ? ' going down' : ''} = ${size} half step${size > 1 ? 's' : ''}. ${tip}`;
    const shared = { hint, play: [a, b], gap: NOTE_GAP, autoplay: true };
    if (Math.random() < 0.5) {
      return {
        ...shared,
        prompt: { type: 'ear' },
        ask: 'Name the interval (tap card to replay)',
        // Same direction only: "… down" next to upward options would give it away.
        choices: pickRandom(it.label, intervalPool(hard).filter((i) => Math.sign(i.st) === Math.sign(it.st)).map((i) => i.label)),
        correct: it.label,
      };
    }
    return {
      ...shared,
      prompt: { type: 'text', text: `${pcName(a)} → ?` },
      ask: 'Tap the second note you hear (tap card to replay)',
      keys: [b],
      exact: false,
    };
  }

  // ---------- Decks ----------
  const DECKS = {
    treble: {
      title: 'Treble clef', sub: 'Read notes, right hand', piano: { lo: 48, hi: 83 },
      pool: (hard) => staffPool('treble', hard ? -6 : -4, 11), make: staffNoteQuestion,
      learn: [
        'The treble clef curls around the G line — line 2.',
        'Lines bottom→top: E G B D F — "Every Good Boy Does Fine".',
        'Spaces bottom→top: F A C E — spells FACE.',
        'Middle C sits on one ledger line below the staff.',
      ],
      ref: [
        { clef: 'treble', label: 'Lines', notes: ['e/4', 'g/4', 'b/4', 'd/5', 'f/5'] },
        { clef: 'treble', label: 'Spaces', notes: ['f/4', 'a/4', 'c/5', 'e/5'] },
      ],
    },
    bass: {
      title: 'Bass clef', sub: 'Read notes, left hand', piano: { lo: 36, hi: 71 },
      pool: (hard) => staffPool('bass', -4, hard ? 15 : 12), make: staffNoteQuestion,
      learn: [
        'The two dots of the bass clef sit around the F line — line 4.',
        'Lines bottom→top: G B D F A — "Good Boys Do Fine Always".',
        'Spaces bottom→top: A C E G — "All Cows Eat Grass".',
        'Middle C sits on one ledger line ABOVE the bass staff.',
      ],
      ref: [
        { clef: 'bass', label: 'Lines', notes: ['g/2', 'b/2', 'd/3', 'f/3', 'a/3'] },
        { clef: 'bass', label: 'Spaces', notes: ['a/2', 'c/3', 'e/3', 'g/3'] },
      ],
    },
    grand: {
      title: 'Both clefs', sub: 'Treble + bass mixed', piano: { lo: 48, hi: 83 },
      pool: (hard) => [...staffPool('treble', hard ? -4 : -2, hard ? 11 : 8), ...staffPool('bass', 3, hard ? 12 : 10)], make: staffNoteQuestion,
      learn: ['Check the clef FIRST, then the note.', 'Treble lines: E G B D F. Bass lines: G B D F A.', 'Both clefs meet at Middle C.'],
    },
    chords: {
      title: 'Chords', sub: 'Read triads, treble & bass',
      pool: chordPool, make: chordStaffQuestion,
      learn: [
        'A triad is 3 notes stacked in thirds. In root position they sit all on lines or all on spaces.',
        'Hard mode inverts chords, which breaks that pattern: look for the one wider gap, the root sits just above it.',
        'The bottom note (in root position) is the root and names the chord.',
        'Half the chords are in bass clef. Check the clef first: bass lines are G B D F A, spaces A C E G.',
        ...CHORD_GUIDE,
      ],
      examples: CHORD_EXAMPLES,
    },
    pnotes: {
      title: 'Piano keys', sub: 'Key ↔ note name', piano: { lo: 60, hi: 83 },
      pool: pianoNotePool, make: pianoNoteQuestion,
      learn: [
        'Black keys come in groups of 2 and 3.',
        'C is the white key just left of the group of 2.',
        'F is the white key just left of the group of 3.',
        'Sharp (♯) = next key up (right). Flat (♭) = next key down (left).',
      ],
    },
    pchords: {
      title: 'Piano chords', sub: 'Shape ↔ chord name', piano: { lo: 60, hi: 83 },
      // Own ids: playing a shape is a different skill from reading it, so it gets its own weight.
      pool: () => chordPool().map((c) => ({ ...c, id: `p${c.id}` })), make: chordPianoQuestion,
      learn: [
        'Major chord: root, skip 3 keys, then skip 2 (4 + 3 half steps).',
        'Minor chord: root, skip 2 keys, then skip 3 (3 + 4 half steps).',
        'C, F and G major are all white keys. D, E and A major have a black key in the middle.',
        'Diminished: root, skip 2 keys, skip 2 again (3 + 3). Augmented: root, skip 3, skip 3 again (4 + 4).',
        ...CHORD_GUIDE,
      ],
      examples: CHORD_EXAMPLES,
    },
    values: {
      title: 'Note values', sub: 'Notes, rests, beats',
      pool: (hard) => [...VALUES, ...(hard ? VALUES_HARD : [])].map((v) => ({ id: `val:${v.label}`, v, label: v.label })), make: valueQuestion,
      learn: [
        'Whole = 4 beats, half = 2, quarter = 1, eighth = ½, sixteenth = ¼.',
        'Each flag cuts the value in half. A dot adds half the value.',
        'Whole rest hangs below line 4; half rest sits on line 3.',
      ],
    },
    count: {
      title: 'Rhythm & time', sub: 'Count beats in a measure',
      pool: (hard) => [
        ...['4/4', '3/4', '2/4', ...(hard ? ['5/4'] : [])].map((sig) => ({ id: `miss:${sig}`, kind: 'miss', sig, label: `Count ${sig}` })),
        ...['2/4', '3/4', '4/4', '6/8', '2/2', '3/8', '9/8', '3/2', ...(hard ? ['5/4', '7/8', '12/8', '6/4'] : [])]
          .map((sig) => ({ id: `sig:${sig}`, kind: 'sig', sig, label: `Time ${sig}` })),
      ],
      make: countQuestion,
      learn: [
        'Time signature: top = beats per measure, bottom = which note gets the beat.',
        '4/4: four quarter-note beats. 3/4: three (waltz).',
        '6/8, 9/8, 12/8 are compound: eighth notes in groups of three, so 6/8 is felt as 2 dotted-quarter beats.',
        'Add up the notes; every measure must equal the top number.',
      ],
    },
    keysig: {
      title: 'Key signatures', sub: 'Sharps & flats → key',
      pool: keySigPool, make: keySigQuestion,
      learn: [
        'Sharps always appear in order F C G D A E B. Flats: B E A D G C F.',
        'Sharps: last sharp + half step = the key.',
        'Flats: second-to-last flat = the key. One flat = F major.',
      ],
    },
    ear: {
      title: 'Ear training', sub: 'Hear the chord type',
      pool: () => ['maj', 'min', 'dim', 'aug'].map((q) => ({ id: `ear:${q}`, q, label: QUAL[q].label })),
      make: earQuestion,
      learn: CHORD_GUIDE,
      examples: CHORD_EXAMPLES,
    },
    perfect: {
      title: 'Perfect pitch', sub: 'Name a note by ear', piano: { lo: 60, hi: 83 },
      pool: () => Array.from({ length: 12 }, (_, pc) => ({ id: `pp:${pc}`, pc, label: pcName(60 + pc) })),
      make: perfectPitchQuestion,
      learn: [
        'One note plays with no reference. Tap the key you think it is, in any octave.',
        'Listen to its color: low notes feel dark and warm, high notes bright and thin. Every note has its own shade.',
        'Start with one anchor note (C or A). Hum it during the day and check yourself here.',
        'Missed it? Tap the card to hear it again before you continue.',
        'Honest note: true perfect pitch is very rare in adults. What practice does build is a reliable memory for a few anchor notes, which makes everything else easier. Short daily sessions beat long ones.',
        'Hard mode spreads the notes over three octaves.',
      ],
    },
    relative: {
      title: 'Relative pitch', sub: 'Hear the distance between notes', piano: { lo: 60, hi: 83 },
      pool: intervalPool, make: relativePitchQuestion,
      learn: [
        'Two notes play one after the other. Name the distance between them, or tap the second note when you\'re given the first.',
        'Each interval has a song that starts with it. Sing the start of the song in your head and match it:',
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((st) => `<b>${INTERVALS[st][0]}</b> (${st} half step${st > 1 ? 's' : ''}): ${INTERVALS[st][1]}`),
        'Hard mode adds every interval, and intervals going down.',
      ],
      examples: [1, 2, 3, 4, 5, 7, 12].map((st) => ({ label: INTERVALS[st][0], notes: INTERVALS[st][1], keys: [60, 60 + st], gap: NOTE_GAP })),
    },
  };

  return { DECKS, midi, isBlack, pcName, triad, note, staffHint, chordPool, keySet, fillMeasure, EIGHTHS };
})();

if (typeof module !== 'undefined') module.exports = MM;
