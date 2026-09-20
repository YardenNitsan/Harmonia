import { test, expect, importWav, wavFile, exportedRecord } from './fixtures';
import type { Page } from '@playwright/test';

interface CacheEntry {
  key: string;
  file: string;
  bytes: number;
  checksum: string;
  touched: number;
}
async function index(page: Page): Promise<{ version: number; entries: CacheEntry[] }> {
  return page.evaluate(async () => {
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('harmonia-features-v1');
    return JSON.parse(await (await (await directory.getFileHandle('index.json')).getFile()).text());
  });
}
async function forgetAnalyses(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('harmonia-v1', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('analyses', 'readwrite');
          tx.objectStore('analyses').clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.reload();
}
test('production workers reuse filesystem features across profiles and reload, recovering corruption', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const events: string[] = [];
    (window as unknown as { featureStages: string[] }).featureStages = events;
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (event.data.kind === 'progress') events.push(event.data.stage);
        });
      }
    };
  });
  await page.goto('/');
  await page.getByLabel('Analysis profile').selectOption('fast');
  const file = wavFile('cached-features.wav');
  await importWav(page, file);
  const coldIndex = await index(page);
  expect(coldIndex.version).toBe(1);
  expect(coldIndex.entries).toHaveLength(1);
  await page.getByLabel('Analysis profile').selectOption('accurate');
  await importWav(page, file);
  const accurate = (await exportedRecord(page)).analysis;
  const mixedIndex = await index(page);
  expect(mixedIndex.entries).toHaveLength(2);
  expect(mixedIndex.entries.find((e) => e.key === coldIndex.entries[0].key)?.file).toBe(
    coldIndex.entries[0].file,
  );
  expect(
    await page.evaluate(() => (window as unknown as { featureStages: string[] }).featureStages),
  ).toContain('Reusing local analysis features');
  await forgetAnalyses(page);
  await page.getByLabel('Analysis profile').selectOption('accurate');
  await importWav(page, file);
  const warm = (await exportedRecord(page)).analysis;
  expect({ ...warm, createdAt: '' }).toEqual({ ...accurate, createdAt: '' });
  expect(
    (
      await page.evaluate(() => (window as unknown as { featureStages: string[] }).featureStages)
    ).filter((s) => s === 'Reusing local analysis features'),
  ).toHaveLength(2);
  await page.evaluate(async (name) => {
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('harmonia-features-v1');
    const writer = await (await directory.getFileHandle(name)).createWritable();
    await writer.write(new Uint8Array([0, 1, 2]));
    await writer.close();
  }, coldIndex.entries[0].file);
  await forgetAnalyses(page);
  await page.getByLabel('Analysis profile').selectOption('accurate');
  await importWav(page, file);
  expect({ ...(await exportedRecord(page)).analysis, createdAt: '' }).toEqual({
    ...accurate,
    createdAt: '',
  });
  expect(
    (await index(page)).entries.find((e) => e.key === coldIndex.entries[0].key)?.file,
  ).not.toBe(coldIndex.entries[0].file);
});

test('terminating an origin-filesystem writer releases its lock and orphan recovery permits import', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const source = `navigator.locks.request('harmonia-derived-features-v1', async () => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('harmonia-features-v1', {create:true});
      const writer = await (await directory.getFileHandle('interrupted-orphan.bin', {create:true})).createWritable();
      await writer.write(new Uint8Array([1,2,3])); await writer.close();
      postMessage('held'); await new Promise(() => {});
    });`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = () => resolve();
      worker.onerror = () => reject(new Error('Test worker failed'));
    });
    worker.terminate();
    URL.revokeObjectURL(url);
  });
  await expect
    .poll(() => page.evaluate(async () => (await navigator.locks.query()).held?.length))
    .toBe(0);
  await importWav(page, wavFile('after-termination.wav'));
  expect((await index(page)).entries).toHaveLength(1);
  expect(
    await page.evaluate(async () => {
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('harmonia-features-v1');
      try {
        await directory.getFileHandle('interrupted-orphan.bin');
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
});
