import { SessionController } from '../../../packages/application/session';
import { LocalFileProvider } from '../../../packages/providers/local';
import { createRepository } from '../../../packages/persistence/repository';
import { BrowserAudioAnalysisService } from '../../../packages/audio/browser-analysis';
import { LiveSessionController } from '../../../packages/application/live-session';
import { WindowsCaptureService } from '../../../packages/providers/windows-capture';
import { createStreamingAnalysisService } from '../../../packages/audio/live-service';
import { WholeSongAnalysisService } from '../../../packages/audio/whole-song-analysis';
import { SongSearchController } from '../../../packages/application/song-search';
import { RecordingCatalog } from '../../../packages/providers/catalog';
export const controller = new SessionController({
  player: new LocalFileProvider(),
  repository: createRepository(),
  analyzer: new BrowserAudioAnalysisService(),
});
export const wholeController = new SessionController({
  player: new LocalFileProvider(),
  repository: createRepository(),
  analyzer: new WholeSongAnalysisService(),
});
export const liveController = new LiveSessionController({
  capture: new WindowsCaptureService(),
  analyzer: createStreamingAnalysisService(),
  beforeStart: () => {
    controller.cancel();
    controller.player.pause();
    wholeController.cancel();
    wholeController.player.pause();
  },
});
export const songSearch = new SongSearchController({
  catalog: new RecordingCatalog(),
  beforePrepare: async () => {
    await liveController.stop();
    if (liveController.snapshot().session)
      throw new Error('Live capture is still stopping. Stop it before preparing a song.');
    controller.cancel();
    controller.player.pause();
  },
  prepare: async (file) => {
    await wholeController.importFile(file);
    const result = wholeController.snapshot();
    if (result.status === 'failed') throw new Error(result.error ?? 'Whole-song analysis failed');
  },
  cancelPreparation: () => {
    wholeController.cancel();
    wholeController.player.pause();
  },
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    liveController.dispose();
    songSearch.dispose();
    wholeController.dispose();
    controller.dispose();
  });
