# MusicMentor

Rapid-fire flashcard drills for learning to read music: treble/bass notes, chords, piano keys, note values, rhythm, key signatures and ear training. Answer by multiple choice or by tapping a piano. Missed items come back more often until they stick.

Static site, no build step. Deploys to Vercel as-is. Works offline after the first visit (`sw.js`, network-first, so updates still arrive immediately when online).

- Run locally: `python3 -m http.server` then open http://localhost:8000
- Check the theory logic: `node theory.test.js`

Piano sounds: [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, CC-BY 3.0 (MP3s via Tone.js).
Music notation: [VexFlow](https://www.vexflow.com) 4.2.3 (MIT), bundled as `vexflow.js`.
