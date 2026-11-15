// Launch Radar's entry program (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the comparables model in lib/model.ts, writes the ranked board to
// /output/board.json and the dashboard's dataset to /output/data.js, copies this repository's
// dashboard/ and screenshots/ into /output, and writes /output/dossier.json last with the vendored
// make.fun library, byte for byte what the scorer rebuilds. The run is a pure function of the
// snapshot: two runs write the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's own caps, mirrored so a bad hand-in fails here first with a plainer message. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const DOSSIER_SOFT_CAP = 1_572_864; // the gate's 1.5 MiB
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> or --name=<value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`launch radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`launch radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const boardJson = `${JSON.stringify({ rows: board })}\n`;
if (Buffer.byteLength(boardJson, 'utf8') > 8_388_608) {
  process.stderr.write('launch radar: board.json would pass the gate\'s 8 MiB cap\n');
  process.exit(1);
}
writeFileSync(join(out, 'board.json'), boardJson);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy a directory tree's regular files into `to`, skipping names that start with a dot. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      for (const inner of copyTree(path, join(to, name))) copied.push(`${name}/${inner}`);
    } else if (st.isFile()) {
      copyFileSync(path, join(to, name));
      copied.push(name);
    }
  }
  return copied;
}

const dashFiles = copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashFiles.includes('index.html')) {
  process.stderr.write('launch radar: dashboard/ holds no index.html: the page is what the judge reads\n');
  process.exit(1);
}
const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  process.stderr.write(`launch radar: screenshots/ holds ${shots.length} images: hand in 3 or 4, the board, a detail view and a filtered view among them\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!PLAIN_NAME.test(name)) {
    process.stderr.write(`launch radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  const size = statSync(join(out, 'screenshots', name)).size;
  if (size > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`launch radar: screenshots/${name} is ${size} bytes, over the 512 KiB cap\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossier = buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS });
writeFileSync(join(out, 'dossier.json'), dossier);
if (dossier.length > DOSSIER_SOFT_CAP) {
  process.stderr.write(`launch radar: warning: dossier.json is ${dossier.length} bytes, over the gate's 1.5 MiB: shrink the screenshots\n`);
}

process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked (${radar.early_size} early, ${radar.live_size} live-token protocols set aside)\n` +
    `launch radar: wrote board.json (${board.length} rows), data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images) and dossier.json (${dossier.length} bytes)\n`,
);
