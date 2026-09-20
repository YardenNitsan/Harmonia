// Diagnostic-only lifecycle, adapted from native-smoke.mjs. Never starts a visible window.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, toNamespacedPath } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

const exec = promisify(execFile);
const protocol = 'HARMONIA_HEADLESS_VALIDATION_V1';
const prefix = 'harmonia-native-smoke-';
const root = resolve(import.meta.dirname, '..');

async function listening(port) {
  return new Promise((done) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (active) => {
      socket.destroy();
      done(active);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

export async function createHiddenNativeHarness(executable) {
  if (process.platform !== 'win32') throw new Error('Hidden native validation requires Windows.');
  const binary = await readFile(executable);
  if (!binary.includes(Buffer.from(protocol)))
    throw new Error('Executable lacks hidden validation support. No app was launched.');
  const tempRoot = await realpath(tmpdir());
  const dataDir = await mkdtemp(join(tempRoot, prefix));
  await writeFile(join(dataDir, '.harmonia-validation'), protocol);
  const profileDir = join(dataDir, 'webview');
  const databasePath = join(dataDir, 'harmonia.db');
  let application, browser, port, closePromise;
  let stopped = false;
  let processLog = '';
  const details = {
    protocol,
    executable,
    executableSha256: createHash('sha256').update(binary).digest('hex'),
    isolatedData: true,
    visibleWindowRequested: false,
  };

  async function powershell(script, extraEnv = {}) {
    const result = await exec(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      {
        windowsHide: true,
        timeout: 10000,
        env: { ...process.env, HARMONIA_PROBE_PROFILE: profileDir, ...extraEnv },
      },
    );
    return result.stdout.trim();
  }
  async function ownedProcesses() {
    return JSON.parse(
      (await powershell(`
      $probeOwned = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:HARMONIA_PROBE_PROFILE) } | Select-Object -ExpandProperty ProcessId)
      ConvertTo-Json -InputObject @($probeOwned) -Compress
    `)) || '[]',
    );
  }
  async function waitFor(check, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (stopped) throw new Error('Hidden native probe was stopped.');
      const result = await check();
      if (result) return result;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function launch() {
    assert.equal(stopped, false);
    assert.equal(application, undefined, 'Harness permits only one launch');
    const reservation = createServer();
    await new Promise((done, reject) => {
      reservation.once('error', reject);
      reservation.listen(0, '127.0.0.1', done);
    });
    port = reservation.address().port;
    await new Promise((done, reject) =>
      reservation.close((error) => (error ? reject(error) : done())),
    );
    if (stopped) throw new Error('Hidden native probe was stopped.');
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
        throw new Error(`Native app exited ${child.exitCode}: ${processLog}`);
      try {
        return JSON.parse(await readFile(join(dataDir, 'validation-ready.json'), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
        throw error;
      }
    }, 'hidden startup');
    assert.equal(ready.protocol, protocol);
    assert.equal(ready.hidden, true);
    assert.equal(ready.pid, child.pid);
    assert.equal(
      toNamespacedPath(await realpath(dirname(ready.database))).toLowerCase(),
      toNamespacedPath(dataDir).toLowerCase(),
    );
    await waitFor(() => listening(port), 'WebView2 debugging endpoint');
    const listeners = JSON.parse(
      await powershell(
        `
      $probeConnections = @(Get-NetTCPConnection -State Listen -LocalPort $env:HARMONIA_PROBE_PORT -ErrorAction Stop)
      $probeResult = foreach ($probeConnection in $probeConnections) {
        $probeOwner = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $probeConnection.OwningProcess)
        [pscustomobject]@{ address = $probeConnection.LocalAddress; owned = ($probeOwner.CommandLine -and $probeOwner.CommandLine.Contains($env:HARMONIA_PROBE_PROFILE)) }
      }
      ConvertTo-Json -InputObject @($probeResult) -Compress
    `,
        { HARMONIA_PROBE_PORT: String(port) },
      ),
    );
    assert.ok(listeners.length > 0);
    assert.ok(
      listeners.every((entry) => ['127.0.0.1', '::1'].includes(entry.address) && entry.owned),
      'Debug endpoint must be loopback-only and owned by the isolated profile',
    );
    details.debugEndpointPrivate = true;
    details.hiddenReadinessVerified = true;
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
    details.webviewVersion = browser.version();
    const context = browser.contexts()[0];
    assert.ok(context);
    const page = await waitFor(
      () => context.pages().find((candidate) => /tauri\.localhost|^tauri:/.test(candidate.url())),
      'packaged page',
    );
    page.setDefaultTimeout(15000);
    return page;
  }
  function close() {
    if (closePromise) return closePromise;
    stopped = true;
    closePromise = (async () => {
      const child = application;
      if (child?.pid && child.exitCode === null) {
        await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 10000,
        }).catch((error) => {
          if (child.exitCode === null) processLog += `\nHost cleanup: ${error.message}`;
        });
      }
      if (browser) await Promise.race([browser.close().catch(() => {}), delay(5000)]);
      for (const pid of await ownedProcesses())
        await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 10000,
        }).catch(() => {});
      assert.deepEqual(await ownedProcesses(), [], 'Owned WebView2 processes must exit');
      if (child?.pid) {
        for (let attempt = 0; attempt < 30 && child.exitCode === null; attempt++) await delay(100);
        assert.notEqual(child.exitCode, null, 'Owned native host must exit');
      }
      if (port) {
        for (let attempt = 0; attempt < 30 && (await listening(port)); attempt++) await delay(100);
        assert.equal(await listening(port), false, 'Owned debug port must close');
      }
      const target = await realpath(dataDir);
      assert.equal(dirname(target).toLowerCase(), tempRoot.toLowerCase());
      assert.ok(basename(target).startsWith(prefix));
      assert.equal(await readFile(join(target, '.harmonia-validation'), 'utf8'), protocol);
      await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      return {
        ownedProcessesStopped: true,
        debugPortClosed: true,
        isolatedDataRemoved: true,
        processLog,
      };
    })();
    return closePromise;
  }
  return { launch, close, details, databasePath, dataDir };
}
