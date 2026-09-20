import type { Page } from '@playwright/test';
import { test, expect, wavFile, exportedRecord } from './fixtures';
import type { SavedTrack } from '../../packages/domain/types';

async function assertSynchronized(page: Page, record: SavedTrack) {
  // The UI samples the media clock on animation frames; allow one bounded update.
  await expect(async () => {
    const actual = await page.evaluate(() => {
      const audio = Reflect.get(window, 'progressionAudio') as HTMLAudioElement;
      const buttons = [...document.querySelectorAll('.progression-chord')];
      const timeline = [...document.querySelectorAll('.chord-block')];
      const index = buttons.findIndex((button) => button.classList.contains('active'));
      return {
        time: audio.currentTime,
        index,
        timelineIndex: timeline.findIndex((button) => button.classList.contains('active')),
        current: document.querySelector('[data-testid="current-chord"]')?.textContent,
        active: buttons[index]?.querySelector('strong')?.textContent,
        previous: document.querySelector('[aria-label="Previous chord"]')?.textContent,
        expectedPrevious: buttons[index - 1]?.querySelector('strong')?.textContent ?? '—',
        next: document.querySelector('[aria-label="Next chord"]')?.textContent,
        expectedNext: buttons[index + 1]?.querySelector('strong')?.textContent ?? '—',
      };
    });
    const expectedIndex = record.analysis.segments.findIndex(
      (segment) => segment.start <= actual.time && actual.time < segment.end,
    );
    expect(actual.index).toBe(expectedIndex);
    expect(actual.timelineIndex).toBe(expectedIndex);
    expect(actual.current).toBe(actual.active);
    expect(actual.previous).toBe(actual.expectedPrevious);
    expect(actual.next).toBe(actual.expectedNext);
  }).toPass({ timeout: 250, intervals: [10, 20, 50] });
}

async function centerError(page: Page) {
  return page.locator('.progression-scroll').evaluate((container) => {
    const active = container.querySelector('.active')!;
    const outer = container.getBoundingClientRect();
    const inner = active.getBoundingClientRect();
    const target = Math.max(
      0,
      Math.min(
        container.scrollWidth - container.clientWidth,
        container.scrollLeft + inner.left - outer.left + inner.width / 2 - outer.width / 2,
      ),
    );
    return Math.abs(container.scrollLeft - target);
  });
}

test('full progression follows the audio clock, late seeks and transport, with manual-scroll respite', async ({
  page,
}) => {
  test.setTimeout(90000);
  // Retain the real media element so expectations use its clock, not React state.
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio;
    window.Audio = class extends OriginalAudio {
      constructor(src?: string) {
        super(src);
        Reflect.set(window, 'progressionAudio', this);
      }
    };
  });
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('follow-song.wav', 180));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByText('Details & practice', { exact: true }).click();
  const record = await exportedRecord(page);
  await page.getByText('Details & practice', { exact: true }).click();
  const position = page.getByRole('slider', { name: 'Playback position' });
  await position.fill('5');
  await position.fill('130');
  await expect.poll(() => centerError(page)).toBeLessThan(2);
  await assertSynchronized(page, record);
  for (const [button, seconds] of [
    ['Forward 10 seconds', '140'],
    ['Back 10 seconds', '130'],
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(position).toHaveValue(seconds);
    await expect.poll(() => centerError(page)).toBeLessThan(2);
    await assertSynchronized(page, record);
  }

  const targetIndex = Math.floor(record.analysis.segments.length / 3);
  const target = record.analysis.segments[targetIndex];
  await page.locator('.progression-chord').nth(targetIndex).click();
  await expect(position).toHaveValue(String(Number(target.start.toFixed(2))));
  await expect(page.locator('.progression-chord').nth(targetIndex)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect.poll(() => centerError(page)).toBeLessThan(2);
  await assertSynchronized(page, record);

  const pausedScroll = await page
    .locator('.progression-scroll')
    .evaluate((node) => node.scrollLeft);
  // A paused clock must keep its position across ordinary UI rerenders.
  await page.getByRole('button', { name: 'Favorite track' }).click();
  await expect(position).toHaveValue(String(Number(target.start.toFixed(2))));
  expect(await page.locator('.progression-scroll').evaluate((node) => node.scrollLeft)).toBe(
    pausedScroll,
  );

  const transitionIndex = record.analysis.segments.findIndex(
    (segment, index) => index > targetIndex && segment.end - segment.start > 0.8,
  );
  expect(transitionIndex).toBeGreaterThan(targetIndex);
  const boundary = record.analysis.segments[transitionIndex].start;
  await position.fill((boundary - 0.4).toFixed(2));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.progression-chord').nth(transitionIndex)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect.poll(() => centerError(page)).toBeLessThan(2);
  await assertSynchronized(page, record);

  await page.locator('.progression-scroll').hover();
  await page.mouse.wheel(-700, 0);
  await expect.poll(() => centerError(page)).toBeGreaterThan(100);
  const manuallyScrolled = await page
    .locator('.progression-scroll')
    .evaluate((node) => node.scrollLeft);
  await page.waitForTimeout(500);
  expect(await page.locator('.progression-scroll').evaluate((node) => node.scrollLeft)).toBe(
    manuallyScrolled,
  );
  await expect.poll(() => centerError(page), { timeout: 5000 }).toBeLessThan(2);
  await assertSynchronized(page, record);

  // An explicit seek overrides a still-active manual-scroll respite immediately.
  await page.mouse.wheel(-700, 0);
  await expect.poll(() => centerError(page)).toBeGreaterThan(100);
  await position.fill('130');
  await expect.poll(() => centerError(page), { timeout: 1000 }).toBeLessThan(2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await assertSynchronized(page, record);
  await position.fill('0');
  await assertSynchronized(page, record);
  await expect.poll(() => centerError(page)).toBeLessThan(2);
  await position.fill('179.99');
  await assertSynchronized(page, record);
  await expect.poll(() => centerError(page)).toBeLessThan(2);
});
