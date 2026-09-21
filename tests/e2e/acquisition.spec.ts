import { test, expect, wavFile } from './fixtures';
import { NATIVE_MODEL_VERSION } from '../../packages/audio/native-whole';

// Native IPC is simulated here; actual providers have separate native evidence.
// Both bad and good bytes really traverse hashing, validation, decode and the worker.
test('acquired audio decoder failure falls through, freezes before play and reopens from cache', async ({
  page,
}) => {
  const bytes = wavFile('acquired.wav', 180).buffer.toString('base64');
  await page.route('https://commons.wikimedia.org/w/api.php?*', (route) =>
    route.fulfill({ json: { query: { pages: {} } } }),
  );
  await page.addInitScript(
    ({ base64, modelVersion }) => {
      const good = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bad = new TextEncoder().encode('<html>not audio</html>');
      let selected = bad;
      let rejected = false;
      const records = new Map<string, unknown>();
      const requests: string[][] = [];
      const workers: { done?: number }[] = [];
      const plays: number[] = [];
      Object.assign(window, {
        isTauri: true,
        acquisitionTest: { requests, workers, plays },
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: Record<string, unknown> = {}) => {
            if (command === 'list_saved_tracks')
              return { records: [...records.values()], issues: [] };
            if (command === 'save_track') {
              const record = args.record as { analysis: { id: string } };
              records.set(record.analysis.id, record);
              return;
            }
            if (command === 'capture_sources') return [];
            if (
              command === 'search_cancel' ||
              command === 'audio_cancel' ||
              command === 'recognition_cancel'
            )
              return;
            if (command === 'recognition_run') {
              const sampleCount = (args as unknown as Uint8Array).byteLength / 4;
              const duration = sampleCount / 22050;
              return {
                schemaVersion: 1,
                modelVersion,
                sampleRate: 22050,
                sampleCount,
                duration,
                segments: [
                  { start: 0, end: duration / 2, label: 'G:maj', score: 0.9 },
                  // Native JSON can round EOF slightly above JS's PCM duration.
                  {
                    start: duration / 2,
                    end: duration + Number.EPSILON * duration,
                    label: 'D:maj',
                    score: 0.9,
                  },
                ],
                beats: [],
                tempo: null,
                warnings: [],
                timings: {
                  setupSeconds: 0,
                  cqtSeconds: 0,
                  inferenceSeconds: 0,
                  decodeSeconds: 0,
                  beatSeconds: 0,
                  totalSeconds: 0,
                },
              };
            }
            if (command === 'youtube_search')
              return [
                {
                  id: 'abcdefghijk',
                  provider: 'youtube',
                  title: 'Acquired song',
                  artist: 'Test artist',
                  thumbnail: null,
                  pageUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
                  duration: 180,
                  audio: null,
                },
              ];
            if (command === 'audio_reject') {
              rejected = true;
              return;
            }
            if (command === 'audio_acquire') {
              requests.push([...(args.excludeProviders as string[])]);
              selected = rejected ? good : bad;
              const digest = await crypto.subtle.digest('SHA-256', selected);
              const fingerprint = Array.from(new Uint8Array(digest), (v) =>
                v.toString(16).padStart(2, '0'),
              ).join('');
              return {
                provider: rejected ? 'cobalt' : 'yt-dlp',
                videoId: 'abcdefghijk',
                title: 'Acquired song',
                duration: 180,
                mime: 'audio/wav',
                container: 'wav',
                cacheToken: 'a'.repeat(64),
                fingerprint,
                byteLength: selected.length,
                cached: requests.length > 2,
                acquisitionMs: 1,
              };
            }
            if (command === 'audio_read')
              return selected.slice(Number(args.offset), Number(args.offset) + Number(args.length))
                .buffer;
            throw new Error(`Unexpected IPC command ${command}`);
          },
        },
      });
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          const w: { done?: number } = {};
          workers.push(w);
          this.addEventListener('message', ({ data }) => {
            if (data.kind === 'result') w.done = performance.now();
          });
        }
      };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        plays.push(performance.now());
        return play.call(this);
      };
    },
    { base64: bytes, modelVersion: NATIVE_MODEL_VERSION },
  );
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Song or artist' }).fill('acquired');
  await page.getByRole('option').filter({ hasText: 'Acquired song' }).click();
  await expect(page.getByRole('region', { name: 'Song player' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const first = await page.evaluate(() => Reflect.get(window, 'acquisitionTest'));
  expect(first.requests).toEqual([[], ['yt-dlp']]);
  expect(first.workers).toHaveLength(1);
  expect(first.plays[0]).toBeGreaterThan(first.workers[0].done);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('slider', { name: 'Playback position' }).fill('120');
  await expect(page.getByTestId('current-chord')).not.toHaveText('—');
  await expect(page.locator('.progression-chord.active')).toHaveCount(1);
  await page.getByRole('button', { name: 'Find another song' }).click();
  await page.getByRole('combobox', { name: 'Song or artist' }).fill('acquired again');
  await page.getByRole('option').filter({ hasText: 'Acquired song' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await expect(page.getByText('Loaded cached analysis.', { exact: true })).toBeVisible();
  expect((await page.evaluate(() => Reflect.get(window, 'acquisitionTest'))).workers).toHaveLength(
    1,
  );
});
