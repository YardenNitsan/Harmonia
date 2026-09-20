import { SessionController } from '../../../packages/application/session';
import { LocalFileProvider } from '../../../packages/providers/local';
import { createRepository } from '../../../packages/persistence/repository';
import { BrowserAudioAnalysisService } from '../../../packages/audio/browser-analysis';
export const controller = new SessionController({
  player: new LocalFileProvider(),
  repository: createRepository(),
  analyzer: new BrowserAudioAnalysisService(),
});
if (import.meta.hot) import.meta.hot.dispose(() => controller.dispose());
