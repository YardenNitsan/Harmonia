// MIT source provenance and inclusion policy: docs/practical-voicing-sources.md.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const revision = 'df06fa7b425cf5fd29485ff6591236b3557e3fac';
const sourceHash = 'cfe439962b2f444d2c341b1f0261403b4c3a3416e321147286fc608922699974';
const raw = process.argv[2]
  ? await readFile(process.argv[2])
  : Buffer.from(
      await (
        await fetch(
          `https://raw.githubusercontent.com/tombatossals/chords-db/${revision}/lib/guitar.json`,
        )
      ).arrayBuffer(),
    );
if (createHash('sha256').update(raw).digest('hex') !== sourceHash)
  throw new Error('Source hash mismatch');
const db = JSON.parse(raw.toString());
const tuning = [40, 45, 50, 55, 59, 64];
const shapes = new Map();
const rejected = {};
let total = 0;
function reject(reason) {
  rejected[reason] = (rejected[reason] ?? 0) + 1;
}
for (const chord of Object.values(db.chords).flat()) {
  for (const position of chord.positions) {
    total++;
    const frets = position.frets.map((fret) =>
      fret < 0 ? null : fret === 0 ? 0 : fret + position.baseFret - 1,
    );
    const fingers = position.fingers.map((finger, string) =>
      frets[string] === null ? null : finger,
    );
    const pressed = frets.filter((fret) => fret !== null && fret > 0);
    const midi = frets.flatMap((fret, string) => (fret === null ? [] : [tuning[string] + fret]));
    if (
      frets.length !== 6 ||
      fingers.length !== 6 ||
      midi.length < 2 ||
      frets.some((fret) => fret !== null && (!Number.isInteger(fret) || fret < 0 || fret > 15)) ||
      Math.max(...pressed) - Math.min(...pressed) > 3
    ) {
      reject('range');
      continue;
    }
    if (JSON.stringify(midi) !== JSON.stringify(position.midi)) {
      reject('midi');
      continue;
    }
    if (
      frets.some(
        (fret, string) =>
          fret !== null &&
          (fret === 0 ? fingers[string] !== 0 : ![1, 2, 3, 4].includes(fingers[string])),
      )
    ) {
      reject('finger');
      continue;
    }
    const barres = [];
    let valid = true;
    for (const finger of [1, 2, 3, 4]) {
      const strings = fingers.flatMap((value, string) => (value === finger ? [string] : []));
      if (strings.length < 2) continue;
      const fromString = strings[0];
      const toString = strings.at(-1);
      const fret = frets[fromString];
      if (
        strings.some((string) => frets[string] !== fret) ||
        frets.slice(fromString, toString + 1).some((value) => value !== null && value < fret) ||
        !position.barres.includes(fret - position.baseFret + 1)
      ) {
        valid = false;
        break;
      }
      barres.push({ fret, fromString, toString, finger });
    }
    // Higher fret placement cannot use a lower-numbered finger across the grip.
    for (let a = 0; a < 6; a++)
      for (let b = a + 1; b < 6; b++) {
        if (frets[a] > 0 && frets[b] > 0 && (frets[a] - frets[b]) * (fingers[a] - fingers[b]) < 0)
          valid = false;
      }
    if (!valid) {
      reject('fingering-or-barre');
      continue;
    }
    const id = frets.map((fret) => fret ?? 'x').join('-');
    if (!shapes.has(id)) shapes.set(id, { frets, fingers, barres });
  }
}
const output = { revision, sourceHash, shapes: [...shapes.values()] };
await writeFile(
  new URL('../packages/domain/data/guitar-shapes.json', import.meta.url),
  JSON.stringify(output) + '\n',
);
console.log(JSON.stringify({ total, acceptedUnique: shapes.size, rejected }));
