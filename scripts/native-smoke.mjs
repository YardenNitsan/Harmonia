import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, mkdir, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, toNamespacedPath } from 'node:path';
import { createServer, connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { readNativeRecords } from '../packages/persistence/native-probe.mjs';

const protocol = 'HARMONIA_HEADLESS_VALIDATION_V1';
const prefix = 'harmonia-native-smoke-';
const root = resolve(import.meta.dirname, '..');
const exec = promisify(execFile);
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`Missing ${name} value`);
  return resolve(args[index + 1]);
}
const executable = option(
  '--exe',
  join(root, 'apps/desktop/src-tauri/target/release/harmonia.exe'),
);
const reportPath = option('--report', join(root, 'docs/review-evidence/native-smoke.json'));
if (args.includes('--help')) {
  console.log(
    'node scripts/native-smoke.mjs [--exe RELEASE_EXE] [--report REPORT_JSON]\nRuns only a binary supporting hidden validation; no visible window is opened.',
  );
  process.exit(0);
}
for (let i = 0; i < args.length; i += 2) {
  if (!['--exe', '--report'].includes(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
}
if (process.platform !== 'win32')
  throw new Error('Native WebView2 smoke validation requires Windows.');
// Refuse pre-validation binaries before process creation: older builds ignore unknown flags.
if (!(await readFile(executable)).includes(Buffer.from(protocol))) {
  throw new Error(
    'This executable lacks hidden validation support. Rebuild it before running this script. No app was launched.',
  );
}
const tempRoot = await realpath(tmpdir());
const dataDir = await mkdtemp(join(tempRoot, prefix));
await writeFile(join(dataDir, '.harmonia-validation'), protocol);
const profileDir = join(dataDir, 'webview');
const databasePath = join(dataDir, 'harmonia.db');
const ports = new Set();
let application;
let browser;
let aborted = false;
let processLog = '';
const pageErrors = [];
const report = {
  protocol,
  executable,
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  pageErrors,
};

async function powershell(script, extraEnv = {}) {
  const result = await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    {
      windowsHide: true,
      timeout: 10000,
      env: { ...process.env, HARMONIA_SMOKE_PROFILE: profileDir, ...extraEnv },
    },
  );
  return result.stdout.trim();
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePort);
  });
  const port = server.address().port;
  await new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())));
  return port;
}

async function listening(port) {
  return new Promise((resolveState) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (active) => {
      socket.destroy();
      resolveState(active);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function waitFor(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (aborted) throw new Error('Native validation interrupted');
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function assertPrivateEndpoint(port) {
  const output = await powershell(
    `
    $smokeConnections = @(Get-NetTCPConnection -State Listen -LocalPort $env:HARMONIA_SMOKE_PORT -ErrorAction Stop)
    $smokeResult = foreach ($smokeConnection in $smokeConnections) {
      $smokeOwner = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $smokeConnection.OwningProcess)
      [pscustomobject]@{ address = $smokeConnection.LocalAddress; owned = ($smokeOwner.CommandLine -and $smokeOwner.CommandLine.Contains($env:HARMONIA_SMOKE_PROFILE)) }
    }
    ConvertTo-Json -InputObject @($smokeResult) -Compress
  `,
    { HARMONIA_SMOKE_PORT: String(port) },
  );
  const listeners = JSON.parse(output);
  assert.ok(listeners.length > 0, 'WebView2 debugging listener must exist');
  assert.ok(
    listeners.every((entry) => ['127.0.0.1', '::1'].includes(entry.address) && entry.owned),
    'Debugging must bind only loopback and belong to this isolated WebView2 profile',
  );
}

async function stopApplication() {
  const child = application;
  application = undefined;
  if (child?.pid && child.exitCode === null) {
    await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 10000,
    }).catch((error) => {
      if (child.exitCode === null) processLog += `\nTask cleanup: ${error.message}`;
    });
  }
  if (browser) await Promise.race([browser.close().catch(() => {}), delay(5000)]);
  browser = undefined;
  // WebView2 can outlive its host. Only reap processes naming this unique temporary profile.
  const output = await powershell(`
    $smokeOwned = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:HARMONIA_SMOKE_PROFILE) } | Select-Object -ExpandProperty ProcessId)
    ConvertTo-Json -InputObject @($smokeOwned) -Compress
  `);
  for (const pid of JSON.parse(output || '[]')) {
    await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 10000,
    }).catch(() => {});
  }
}

async function launch() {
  if (aborted) throw new Error('Native validation interrupted');
  const port = await freePort();
  ports.add(port);
  await unlink(join(dataDir, 'validation-ready.json')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (aborted) throw new Error('Native validation interrupted');
  application = spawn(executable, ['--validation-headless', '--validation-data-dir', dataDir], {
    cwd: root,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profileDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`,
    },
  });
  const child = application;
  let launchError;
  child.once('error', (error) => {
    launchError = error;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      processLog = (processLog + chunk).slice(-16000);
    });
  const ready = await waitFor(async () => {
    if (launchError) throw launchError;
    if (child.exitCode !== null)
      throw new Error(`Native app exited (${child.exitCode}) before readiness: ${processLog}`);
    try {
      return JSON.parse(await readFile(join(dataDir, 'validation-ready.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
      throw error;
    }
  }, 'hidden native startup');
  assert.equal(ready.protocol, protocol);
  assert.equal(ready.hidden, true);
  assert.equal(ready.pid, child.pid);
  assert.equal(
    toNamespacedPath(await realpath(dirname(ready.database))).toLowerCase(),
    toNamespacedPath(dataDir).toLowerCase(),
  );
  await waitFor(() => listening(port), 'WebView2 debugging endpoint');
  await assertPrivateEndpoint(port);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
  const context = browser.contexts()[0];
  assert.ok(context, 'WebView2 browser context');
  const page = await waitFor(
    () => context.pages().find((candidate) => /tauri\.localhost|^tauri:/.test(candidate.url())),
    'packaged app page',
  );
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Observe actual media elements without replacing decoding, analysis, playback, or IPC.
  // Hidden Windows WebViews may suspend the UI animation clock; media.currentTime is authoritative.
  await page.addInitScript(() => {
    const audioElements = [];
    window.__harmoniaSmokeAudio = audioElements;
    window.Audio = new Proxy(window.Audio, {
      construct(target, parameters) {
        const audio = Reflect.construct(target, parameters);
        audioElements.push(audio);
        return audio;
      },
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Open a song', exact: true })).toBeVisible();
  return page;
}

function wav() {
  const rate = 22050,
    duration = 6,
    length = rate * duration;
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(length * 2, 40);
  const chords = [
    [48, 60, 64, 67],
    [45, 57, 60, 64],
    [43, 55, 59, 62],
  ];
  for (let i = 0; i < length; i++) {
    const time = i / rate,
      within = time % 2;
    const envelope = Math.min(1, within / 0.02, (2 - within) / 0.04);
    const sample =
      chords[Math.floor(time / 2)].reduce(
        (sum, midi) => sum + Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * time),
        0,
      ) / 4;
    buffer.writeInt16LE(Math.round(sample * envelope * 24000), 44 + i * 2);
  }
  return { name: 'native-validation.wav', mimeType: 'audio/wav', buffer };
}

function databaseRecords() {
  return readNativeRecords(databasePath);
}

async function featureFiles(page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('harmonia-features-v1');
    const indexFile = await (await directory.getFileHandle('index.json')).getFile();
    if (indexFile.size > 65536) throw new Error('Native feature index exceeds its bound');
    const index = JSON.parse(await indexFile.text());
    const payloads = [];
    for (const entry of index.entries) {
      const file = await (await directory.getFileHandle(entry.file)).getFile();
      if (file.size > 16 * 1024 * 1024) throw new Error('Native feature payload exceeds its bound');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      payloads.push({
        ...entry,
        actualBytes: file.size,
        actualChecksum: Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join(''),
      });
    }
    return payloads;
  });
}

async function clock(page) {
  return page.evaluate(
    () =>
      window.__harmoniaSmokeAudio.filter((audio) => audio.src.startsWith('blob:')).at(-1)
        ?.currentTime ?? 0,
  );
}

async function smoke() {
  const page = await launch();
  report.checks.push('hidden startup, isolated data, loopback-only debugging');
  await page.getByLabel('Import audio file').setInputFiles(wav());
  await expect(page.getByTestId('track-title')).toHaveText('native-validation.wav');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const first = databaseRecords();
  assert.equal(first.length, 1);
  assert.equal(first[0].analysis.modelVersion, 'dsp-template-v1');
  assert.ok(first[0].analysis.segments.length > 1);
  assert.ok(first[0].analysis.waveform.length > 0);
  const initialFeatures = await featureFiles(page);
  assert.equal(initialFeatures.length, 1, 'DSP creates one reusable filesystem payload');
  assert.equal(initialFeatures[0].bytes, initialFeatures[0].actualBytes);
  assert.equal(initialFeatures[0].checksum, initialFeatures[0].actualChecksum);
  report.checks.push('packaged asset decoding, real worker DSP analysis, native IPC SQLite save');
  await page.getByRole('button', { name: 'Play', exact: true }).click({ force: true });
  await expect.poll(() => clock(page), { timeout: 8000 }).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: /^(Play|Pause)$/ }).click({ force: true });
  await page.getByLabel('Playback position').fill('3');
  await expect.poll(() => clock(page)).toBeCloseTo(3, 1);
  await page.getByRole('button', { name: 'Restart', exact: true }).click({ force: true });
  await page
    .getByRole('button', { name: 'Edit current chord', exact: true })
    .click({ force: true });
  await page.getByLabel('Chord symbol').fill('Dm9');
  const originalFirst = first[0].analysis.segments[0];
  const inset = (originalFirst.end - originalFirst.start) / 10;
  const correctedStart = originalFirst.start + inset;
  const correctedEnd = originalFirst.end - inset;
  await page.getByLabel('Start time in seconds').fill(String(correctedStart));
  await page.getByLabel('End time in seconds').fill(String(correctedEnd));
  await page.getByRole('button', { name: 'Save correction', exact: true }).click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => databaseRecords()[0].corrections.length).toBe(2);
  const corrected = databaseRecords()[0];
  assert.equal(corrected.analysis.segments[0].chord.root, 2);
  assert.equal(corrected.analysis.segments[0].chord.triad, 'minor');
  assert.equal(corrected.analysis.segments[0].start, correctedStart);
  assert.equal(corrected.analysis.segments[0].end, correctedEnd);
  assert.equal(corrected.analysis.segments[1].start, correctedEnd);
  await page.getByRole('button', { name: 'Favorite track', exact: true }).click({ force: true });
  await expect.poll(() => databaseRecords()[0].track.favorite).toBe(true);
  report.checks.push(
    'real media clock playback/seek, atomic chord/start/end and neighboring history, favorite persisted in SQLite',
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('Analysis profile').selectOption('accurate');
  await page
    .getByLabel('Import audio file')
    .setInputFiles({ ...wav(), name: 'native-experimental.wav' });
  await expect(page.getByTestId('track-title')).toHaveText('native-experimental.wav', {
    timeout: 30000,
  });
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const records = databaseRecords();
  assert.equal(records.length, 2);
  const experimental = records.find((record) => record.track.name === 'native-experimental.wav');
  assert.ok(experimental, 'experimental import saved its distinct analysis');
  assert.equal(experimental.analysis.profile, 'accurate');
  assert.equal(experimental.analysis.modelVersion, 'E004-transposition-tcn');
  assert.equal(experimental.track.fingerprint, corrected.track.fingerprint);
  assert.notEqual(experimental.analysis.id, corrected.analysis.id);
  assert.equal(experimental.track.favorite, true);
  assert.deepEqual(
    records.find((record) => record.analysis.id === corrected.analysis.id).corrections,
    corrected.corrections,
  );
  const bothFeatures = await featureFiles(page);
  assert.equal(bothFeatures.length, 2, 'Accurate adds model features and reuses DSP features');
  const reusedDsp = bothFeatures.find((entry) => entry.key === initialFeatures[0].key);
  assert.ok(reusedDsp);
  assert.equal(reusedDsp.file, initialFeatures[0].file);
  assert.equal(reusedDsp.actualChecksum, initialFeatures[0].actualChecksum);
  assert.ok(reusedDsp.touched > initialFeatures[0].touched);
  for (const entry of bothFeatures) {
    assert.equal(entry.bytes, entry.actualBytes);
    assert.equal(entry.checksum, entry.actualChecksum);
  }
  report.checks.push(
    'packaged experimental E004 ONNX/WASM inference passes native CSP and preserves a second profile in SQLite',
  );
  assert.deepEqual(pageErrors, []);
  await stopApplication();
  const reopened = await launch();
  await reopened
    .getByRole('button', { name: 'Open analysis: native-validation.wav', exact: true })
    .click({ force: true });
  await expect(reopened.getByTestId('current-chord')).toHaveText('—');
  // The seek slider accepts 0.01s steps; enter a representable point inside the segment.
  await reopened
    .getByLabel('Playback position')
    .fill(String(Math.ceil(correctedStart * 100) / 100));
  await expect(reopened.getByTestId('current-chord')).toHaveText('Dm9');
  await expect(
    reopened.getByRole('button', { name: 'Favorite track', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(reopened.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  const restored = databaseRecords().find((record) => record.analysis.id === corrected.analysis.id);
  assert.ok(restored);
  assert.equal(restored.analysis.id, corrected.analysis.id);
  assert.deepEqual(restored.corrections, corrected.corrections);
  assert.deepEqual(restored.analysis.segments, corrected.analysis.segments);
  const restoredFeatures = await featureFiles(reopened);
  assert.deepEqual(restoredFeatures, bothFeatures);
  report.checks.push(
    'native process restart restores SQLite analysis, correction, favorite and detached-audio state',
  );
  await reopened.getByLabel('Analysis profile').selectOption('fast');
  await reopened
    .getByLabel('Import audio file')
    .setInputFiles({ ...wav(), name: 'native-cache-reuse.wav' });
  await expect(reopened.getByTestId('track-title')).toHaveText('native-cache-reuse.wav');
  await expect(reopened.getByText('Saved on this device', { exact: true })).toBeVisible();
  const warmFeatures = await featureFiles(reopened);
  assert.equal(warmFeatures.length, 2);
  const restartedDsp = warmFeatures.find((entry) => entry.key === reusedDsp.key);
  assert.ok(restartedDsp);
  assert.equal(restartedDsp.file, reusedDsp.file);
  assert.equal(restartedDsp.actualChecksum, reusedDsp.actualChecksum);
  assert.ok(restartedDsp.touched > reusedDsp.touched);
  report.checks.push(
    'worker OPFS feature checksums, cross-profile reuse and reuse after native process restart',
  );
  assert.deepEqual(pageErrors, []);
}

let rejectInterrupted;
const interrupted = new Promise((_, reject) => {
  rejectInterrupted = reject;
});
const interrupt = () => {
  aborted = true;
  rejectInterrupted(new Error('Native validation interrupted'));
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const watchdog = setTimeout(() => {
  aborted = true;
  rejectInterrupted(new Error('Native validation exceeded 120 seconds'));
}, 120000);
try {
  await Promise.race([smoke(), interrupted]);
  report.passed = true;
} catch (error) {
  report.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  aborted = true;
  clearTimeout(watchdog);
  try {
    await stopApplication();
    for (const port of ports) {
      for (let attempt = 0; attempt < 30 && (await listening(port)); attempt++) await delay(100);
      assert.equal(await listening(port), false, `Debugging port ${port} must close`);
    }
    const target = await realpath(dataDir);
    assert.equal(dirname(target).toLowerCase(), tempRoot.toLowerCase());
    assert.ok(basename(target).startsWith(prefix));
    assert.equal(await readFile(join(target, '.harmonia-validation'), 'utf8'), protocol);
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    report.cleanup =
      'owned native/WebView2 processes stopped, debug ports closed, synthetic temporary data removed';
  } catch (error) {
    report.passed = false;
    report.cleanupError = String(error);
    report.retainedTemporaryDirectory = dataDir;
    process.exitCode = 1;
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  report.finishedAt = new Date().toISOString();
  report.processLog = processLog;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed ? 'PASS' : 'FAIL'}: native hidden smoke; report ${reportPath}`);
}
