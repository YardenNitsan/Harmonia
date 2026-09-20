import { expect, it, vi } from 'vitest';
import { SongSearchController } from './song-search';
import type { CatalogRecording } from './catalog-contracts';

const recording: CatalogRecording = {
  id: 'commons:42',
  provider: 'commons',
  title: 'Permitted recording',
  artist: 'Artist',
  duration: 180,
  thumbnail: null,
  pageUrl: 'https://commons.wikimedia.org/wiki/File:Song.ogg',
  audio: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Song.ogg',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Artist',
    size: 100,
  },
};
function fixture() {
  const acquire = vi.fn(async () => new File(['audio'], 'Song.ogg'));
  const analyze = vi.fn(async (_file: File) => {});
  const cancel = vi.fn();
  const controller = new SongSearchController({
    catalog: { search: vi.fn(async () => [recording]), acquire },
    prepare: analyze,
    cancelPreparation: cancel,
    beforePrepare: async () => {},
  });
  return { controller, acquire, analyze, cancel };
}
it('selection obtains a permitted whole input before preparing, without playing', async () => {
  const { controller, acquire, analyze } = fixture();
  await controller.search('Song', 'commons');
  await controller.select(recording);
  expect(acquire).toHaveBeenCalledOnce();
  expect(analyze).toHaveBeenCalledOnce();
  expect(controller.snapshot().status).toBe('ready');
  expect(controller.snapshot().selected?.id).toBe(recording.id);
});
it('YouTube metadata does not masquerade as analysis PCM', async () => {
  const { controller, acquire, analyze } = fixture();
  await controller.select({ ...recording, provider: 'youtube', audio: null });
  expect(controller.snapshot().status).toBe('input-required');
  expect(acquire).not.toHaveBeenCalled();
  expect(analyze).not.toHaveBeenCalled();
});
it('navigation cancellation pauses preparation without hiding an already complete timeline', async () => {
  const { controller, cancel } = fixture();
  await controller.select(recording);
  controller.cancel();
  expect(controller.snapshot().status).toBe('ready');
  expect(controller.snapshot().selected).toEqual(recording);
  expect(cancel).toHaveBeenCalled();
});
it('cancelled download cannot start analysis when its promise resolves late', async () => {
  const { controller, acquire, analyze } = fixture();
  let release!: (file: File) => void;
  acquire.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = controller.select(recording);
  await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());
  controller.cancel();
  release(new File(['x'], 'old.ogg'));
  await pending;
  expect(analyze).not.toHaveBeenCalled();
  expect(controller.snapshot().status).toBe('idle');
});
it('failed source shutdown prevents network acquisition and analysis', async () => {
  const acquire = vi.fn();
  const controller = new SongSearchController({
    catalog: { search: vi.fn(), acquire },
    prepare: vi.fn(),
    cancelPreparation: vi.fn(),
    beforePrepare: async () => {
      throw new Error('Capture is still stopping');
    },
  });
  await controller.select(recording);
  expect(acquire).not.toHaveBeenCalled();
  expect(controller.snapshot().error).toContain('still stopping');
});
