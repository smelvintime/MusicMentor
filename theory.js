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
  const pick = (correct, distractors, n = 4) =>
    shuffle([correct, ...distractors.filter((d) => d !== correct).slice(0, n - 1)]);
  const pickRandom = (correct, pool, n = 4) => pick(correct, shuffle(pool), n);

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

  function staffPool(clef, lo, hi, adv) {
    const items = [];
    for (let p = lo; p <= hi; p++) {
      const base = fromDia(CLEFS[clef].bottom + p);
      for (const acc of adv ? ['', '#', 'b'] : ['']) {
        const n = { ...base, acc };
        if (ODD.includes(n.letter + acc)) continue;
        items.push({ id: `${clef}:${vex(n)}`, clef, n, label: `${name(n)}${n.oct}` });
      }
    }
    return items;
  }

  function staffNoteQuestion(it, adv) {
    const { clef, n } = it;
    const variants = ['', '#', 'b'].map((a) => n.letter + SYM[a]).filter((x) => !ODD.includes(x.replace('♯', '#').replace('♭', 'b')));
    const others = shuffle(LETTERS.split('').filter((l) => l !== n.letter));
    return {
      prompt: { type: 'staff', clef, notes: [{ keys: [vex(n)], accs: [n.acc], dur: 'w' }] },
      ask: 'Name this note',
      choices: adv ? pick(name(n), [...shuffle(variants), ...others]) : LETTERS.split(''),
      correct: adv ? name(n) : n.letter,
      keys: [midi(n)],
      exact: true,
      hint: staffHint(clef, n),
      play: [midi(n)],
    };
  }

  // ---------- Chords ----------
  const QUAL = {
    maj: { st: [4, 7], sfx: '', label: 'Major', tip: 'root + 4 half steps + 3 more (bright, happy)' },
    min: { st: [3, 7], sfx: 'm', label: 'Minor', tip: 'root + 3 half steps + 4 more (dark, sad)' },
    dim: { st: [3, 6], sfx: 'dim', label: 'Diminished', tip: 'root + 3 + 3 half steps (tense)' },
    aug: { st: [4, 8], sfx: '+', label: 'Augmented', tip: 'root + 4 + 4 half steps (dreamy, unresolved)' },
  };

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

  function chordPool(adv) {
    const items = [];
    for (const letter of LETTERS) {
      for (const acc of adv ? ['', '#', 'b'] : ['', 'b']) {
        for (const q of adv ? ['maj', 'min', 'dim', 'aug'] : ['maj', 'min']) {
          if (!adv && acc === 'b' && !(q === 'maj' && 'BEA'.includes(letter))) continue; // B♭ E♭ A♭ majors only
          const root = note(letter, acc, 4);
          if (ODD.includes(letter + acc)) continue;
          const notes = triad(root, q);
          if (notes) items.push({ id: `chord:${letter}${acc}${q}`, q, notes, label: name(root) + QUAL[q].sfx });
        }
      }
    }
    return items;
  }

  const chordHint = (it) =>
    `${it.label} = ${it.notes.map(name).join(' – ')}. ${QUAL[it.q].label}: ${QUAL[it.q].tip}. Bottom note on the staff is the root.`;

  function chordStaffQuestion(it, adv) {
    return {
      prompt: { type: 'staff', clef: 'treble', notes: [{ keys: it.notes.map(vex), accs: it.notes.map((n) => n.acc), dur: 'w' }] },
      ask: 'Name this chord',
      choices: pickRandom(it.label, chordPool(adv).map((c) => c.label)),
      correct: it.label,
      keys: it.notes.map(midi),
      exact: true,
      hint: chordHint(it),
      play: it.notes.map(midi),
    };
  }

  function chordPianoQuestion(it, adv) {
    const keys = it.notes.map(midi);
    if (Math.random() < 0.5) {
      return {
        prompt: { type: 'piano', highlight: keys },
        ask: 'Which chord is this?',
        choices: pickRandom(it.label, chordPool(adv).map((c) => c.label)),
        correct: it.label,
        hint: chordHint(it),
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
  function pianoNotePool(adv) {
    const items = [];
    for (let m = 60; m < 72; m++) if (adv || !isBlack(m)) items.push({ id: `pkey:${m}`, m, label: pcName(m) });
    return items;
  }

  function pianoNoteQuestion(it, adv) {
    const m = it.m + (Math.random() < 0.5 ? 0 : 12); // either octave
    const nm = pcName(m);
    const hint = isBlack(m)
      ? `Black keys come in groups of 2 and 3. ${nm}: a sharp is the key just right of a white key, a flat just left.`
      : `C is the white key just left of each group of 2 black keys. Count up from C: C D E F G A B → ${nm}.`;
    if (Math.random() < 0.5) {
      return {
        prompt: { type: 'piano', highlight: [m] },
        ask: 'Name this key',
        choices: adv ? pickRandom(nm, pianoNotePool(true).map((i) => i.label)) : LETTERS.split(''),
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
  const BEATS = ['4', '3', '2', '1½', '1', '½', '¼'];
  const VALUE_TIPS = {
    w: 'Hollow head, no stem = 4 beats.', h: 'Hollow head with a stem = 2 beats.', q: 'Filled head with a stem = 1 beat.',
    8: 'One flag (or beam) halves a quarter = ½ beat.', 16: 'Two flags = ¼ beat.',
    hd: 'A dot adds half the value: 2 + 1 = 3 beats.', qd: 'A dot adds half the value: 1 + ½ = 1½ beats.',
    wr: 'Whole rest hangs DOWN from line 4 (heavy, it fell) = 4 beats.', hr: 'Half rest sits ON line 3 like a hat = 2 beats.',
    qr: 'The squiggle = 1 beat of silence.', '8r': 'One flag-like hook = ½ beat of silence.',
  };

  function valueQuestion(it) {
    const v = it.v;
    const rest = v.dur.includes('r');
    const prompt = { type: 'staff', clef: null, notes: [{ keys: [v.dur === 'wr' ? 'd/5' : 'b/4'], dur: v.dur }] };
    const hint = `${v.label}. ${VALUE_TIPS[v.dur]}`;
    if (Math.random() < 0.5) {
      return { prompt, ask: 'How many beats? (in 4/4)', choices: pickRandom(v.beats, BEATS), correct: v.beats, hint };
    }
    const pool = VALUES.filter((x) => x.dur.includes('r') === rest).map((x) => x.label);
    return { prompt, ask: 'What is this called?', choices: pickRandom(v.label, pool), correct: v.label, hint };
  }

  const FRAC = { 1: '½', 2: '1', 3: '1½', 4: '2', 5: '2½', 6: '3' };
  const EIGHTHS = { h: 4, q: 2, 8: 1, hd: 6, qr: 2 };

  function fillMeasure(eighths, adv) {
    const out = [];
    let rem = eighths;
    while (rem > 0) {
      const opts = ['h', 'q', 'q', 'qr', '8', 'hd'].filter((d) => EIGHTHS[d] <= rem && (d !== '8' || adv || rem >= 2));
      const d = rand(opts);
      // keep eighths in beamable pairs
      if (d === '8' && rem >= 2) { out.push(d, d); rem -= 2; } else { out.push(d); rem -= EIGHTHS[d]; }
    }
    return out;
  }

  function countQuestion(it, adv) {
    if (it.kind === 'sig') {
      const [top, bottom] = it.sig.split('/');
      const beatNote = { 2: 'Half note', 4: 'Quarter note', 8: 'Eighth note' }[bottom];
      const hint = `Top number = beats per measure (${top}). Bottom number = which note gets one beat (${bottom} → ${beatNote.toLowerCase()}).`;
      const prompt = { type: 'staff', clef: 'treble', timeSig: it.sig, notes: [] };
      return Math.random() < 0.5
        ? { prompt, ask: 'How many beats per measure?', choices: pickRandom(top, ['2', '3', '4', '6', '8']), correct: top, hint }
        : { prompt, ask: 'Which note gets one beat?', choices: ['Half note', 'Quarter note', 'Eighth note'], correct: beatNote, hint };
    }
    const top = +it.sig[0];
    const missing = rand(adv ? [1, 2, 3, 4] : [2, 4]);
    const durs = fillMeasure(top * 2 - missing, adv);
    const notes = durs.map((d) => ({ keys: [d === 'qr' ? 'b/4' : rand(['g/4', 'a/4', 'b/4', 'c/5', 'd/5'])], dur: d }));
    const counted = durs.map((d) => FRAC[EIGHTHS[d]]).join(' + ');
    return {
      prompt: { type: 'staff', clef: 'treble', timeSig: it.sig, notes },
      ask: 'How many beats are missing?',
      choices: pickRandom(FRAC[missing], ['½', '1', '1½', '2', '3']),
      correct: FRAC[missing],
      hint: `${it.sig} needs ${top} beats. You see ${counted} = ${FRAC[top * 2 - missing]}. Missing ${FRAC[missing]}.`,
    };
  }

  // ---------- Key signatures ----------
  const SHARPS = 'FCGDAEB';
  const FLATS = 'BEADGCF';
  const KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  const keyName = (k) => k.replace('#', '♯').replace('b', '♭') + ' major';

  function keySigQuestion(it, adv) {
    const n = KEYS[it.k];
    const list = (n > 0 ? SHARPS : FLATS).slice(0, Math.abs(n)).split('').map((l) => l + (n > 0 ? '♯' : '♭'));
    let hint = 'No sharps or flats = C major.';
    if (n > 0) hint = `Sharps: ${list.join(' ')}. Last sharp (${list.at(-1)}) + a half step up = ${keyName(it.k)}. Order: Father Charles Goes Down And Ends Battle.`;
    if (n === -1) hint = 'One flat (B♭) = F major — memorize this one.';
    if (n < -1) hint = `Flats: ${list.join(' ')}. The second-to-last flat (${list.at(-2)}) names the key → ${keyName(it.k)}.`;
    return {
      prompt: { type: 'staff', clef: 'treble', keySig: it.k, notes: [] },
      ask: 'Which major key?',
      choices: pickRandom(keyName(it.k), keySigPool(adv).map((x) => keyName(x.k))),
      correct: keyName(it.k),
      hint,
    };
  }
  const keySigPool = (adv) =>
    Object.keys(KEYS).filter((k) => adv || Math.abs(KEYS[k]) <= 4).map((k) => ({ id: `key:${k}`, k, label: keyName(k) }));

  // ---------- Ear ----------
  function earQuestion(it, adv) {
    const r = 48 + Math.floor(Math.random() * 12);
    const keys = [r, r + QUAL[it.q].st[0], r + QUAL[it.q].st[1]];
    const labels = (adv ? ['maj', 'min', 'dim', 'aug'] : ['maj', 'min']).map((q) => QUAL[q].label);
    return {
      prompt: { type: 'ear' },
      ask: 'Major or minor? (tap card to replay)',
      choices: labels,
      correct: QUAL[it.q].label,
      hint: `${QUAL[it.q].label}: ${QUAL[it.q].tip}.`,
      play: keys,
      autoplay: true,
    };
  }

  // ---------- Decks ----------
  const range = (lo, hi) => ({ lo, hi });
  const DECKS = {
    treble: {
      title: 'Treble clef', sub: 'Read notes, right hand', piano: range(48, 83),
      pool: (adv) => staffPool('treble', -4, 11, adv), make: staffNoteQuestion,
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
      title: 'Bass clef', sub: 'Read notes, left hand', piano: range(36, 71),
      pool: (adv) => staffPool('bass', -4, 12, adv), make: staffNoteQuestion,
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
      title: 'Both clefs', sub: 'Treble + bass mixed', piano: range(48, 83),
      pool: (adv) => [...staffPool('treble', -2, 8, adv), ...staffPool('bass', 3, 10, adv)], make: staffNoteQuestion,
      learn: ['Check the clef FIRST, then the note.', 'Treble lines: E G B D F. Bass lines: G B D F A.', 'Both clefs meet at Middle C.'],
    },
    chords: {
      title: 'Chords', sub: 'Read stacked triads', piano: range(60, 83),
      pool: chordPool, make: chordStaffQuestion,
      learn: [
        'A triad is 3 notes stacked in thirds — all on lines or all on spaces.',
        'The bottom note (in root position) is the root and names the chord.',
        'Major = root + 4 half steps + 3. Minor = root + 3 + 4.',
        'Piano mode: tap all 3 keys.',
      ],
    },
    pnotes: {
      title: 'Piano keys', sub: 'Key ↔ note name', piano: range(60, 83),
      pool: pianoNotePool, make: pianoNoteQuestion,
      learn: [
        'Black keys come in groups of 2 and 3.',
        'C is the white key just left of the group of 2.',
        'F is the white key just left of the group of 3.',
        'Sharp (♯) = next key up (right). Flat (♭) = next key down (left).',
      ],
    },
    pchords: {
      title: 'Piano chords', sub: 'Shape ↔ chord name', piano: range(60, 83),
      pool: chordPool, make: chordPianoQuestion,
      learn: [
        'Major chord: root, skip 3 keys, then skip 2 (4 + 3 half steps).',
        'Minor chord: root, skip 2 keys, then skip 3 (3 + 4 half steps).',
        'C, F and G major are all white keys. D, E and A major have a black key in the middle.',
      ],
    },
    values: {
      title: 'Note values', sub: 'Notes, rests, beats',
      pool: () => VALUES.map((v) => ({ id: `val:${v.dur}`, v, label: v.label })), make: valueQuestion,
      learn: [
        'Whole = 4 beats, half = 2, quarter = 1, eighth = ½, sixteenth = ¼.',
        'Each flag cuts the value in half. A dot adds half the value.',
        'Whole rest hangs below line 4; half rest sits on line 3.',
      ],
    },
    count: {
      title: 'Rhythm & time', sub: 'Count beats in a measure',
      pool: (adv) => [
        ...['4/4', '3/4', '2/4'].map((sig) => ({ id: `miss:${sig}`, kind: 'miss', sig, label: `Count ${sig}` })),
        ...['2/4', '3/4', '4/4', '6/8', '2/2', ...(adv ? ['3/8', '9/8', '3/2'] : [])].map((sig) => ({ id: `sig:${sig}`, kind: 'sig', sig, label: `Time ${sig}` })),
      ],
      make: countQuestion,
      learn: [
        'Time signature: top = beats per measure, bottom = which note gets the beat.',
        '4/4: four quarter-note beats. 3/4: three (waltz). 6/8: six eighth notes.',
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
      title: 'Ear training', sub: 'Hear major vs minor',
      pool: (adv) => (adv ? ['maj', 'min', 'dim', 'aug'] : ['maj', 'min']).map((q) => ({ id: `ear:${q}`, q, label: QUAL[q].label })),
      make: earQuestion,
      learn: ['Major sounds bright. Minor sounds darker or sad.', 'Diminished sounds tense; augmented sounds dreamy/unsettled.'],
    },
  };

  return { DECKS, LETTERS, midi, isBlack, pcName, triad, note, staffHint, chordPool, fillMeasure, EIGHTHS, shuffle };
})();

if (typeof module !== 'undefined') module.exports = MM;
