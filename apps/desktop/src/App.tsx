import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SavedTrack } from '../../../packages/domain/types';
import { createAnalysisExport, createTimelineExport } from '../../../packages/application/export';
import { downloadAnalysisExport } from '../../../packages/providers/browser-export';
import { controller, liveController, wholeController, songSearch } from './composition';
import { AppFooter, AppHeader, type AppTab } from './components/AppHeader';
import { LibraryView } from './components/LibraryView';
import { PlaybackStage } from './components/PlaybackStage';
import { AnalysisProgress, SessionError } from './components/SessionStatus';
import { TrackHeading } from './components/TrackHeading';
import { WelcomeView } from './components/WelcomeView';
import { AnalysisProfilePicker } from './components/AnalysisProfilePicker';
import { LiveListeningStage } from './components/LiveListeningStage';
import { SearchAnalyzeStage } from './components/SearchAnalyzeStage';

const isWholeSong = (record: SavedTrack) =>
  record.analysis.pipelineVersion.startsWith('harmonia-whole-song-');

export function App() {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const whole = useSyncExternalStore(wholeController.subscribe, wholeController.snapshot);
  const input = useRef<HTMLInputElement>(null);
  const navigation = useRef(0);
  const [tab, setTab] = useState<AppTab>('search');
  // Both controllers initially read the same repository. Only each record's owner
  // may supply its current copy; the other controller's snapshot can be stale.
  const library = [
    ...state.library.filter((record) => !isWholeSong(record)),
    ...whole.library.filter(isWholeSong),
  ];
  const activeController = tab === 'whole-saved' ? wholeController : controller;
  const active = tab === 'whole-saved' ? whole : state;
  useEffect(() => {
    void controller.initialize();
    void wholeController.initialize();
    void liveController.refreshSources();
  }, []);
  const busy = state.status === 'preparing' || state.status === 'analyzing';
  const importAudio = () => input.current?.click();
  const navigate = async (next: AppTab) => {
    const revision = ++navigation.current;
    if (next !== 'listen') await liveController.stop();
    controller.player.pause();
    wholeController.player.pause();
    if (next !== 'search' && next !== 'file') songSearch.cancel();
    if (next !== 'listen' && liveController.snapshot().session) return;
    if (revision === navigation.current) setTab(next);
  };
  const importFile = async (file: File) => {
    const revision = ++navigation.current;
    await liveController.stop();
    if (liveController.snapshot().session) return;
    if (revision !== navigation.current) return;
    if (tab === 'legacy') await controller.importFile(file);
    else {
      setTab('file');
      await songSearch.local(file);
    }
  };
  const openRecord = async (record: SavedTrack) => {
    const revision = ++navigation.current;
    await liveController.stop();
    if (liveController.snapshot().session) return;
    if (revision !== navigation.current) return;
    songSearch.cancel(false);
    controller.player.pause();
    if (isWholeSong(record)) {
      wholeController.open(record);
      setTab('whole-saved');
    } else {
      controller.open(record);
      setTab('legacy');
    }
  };
  const exportAnalysis = () => {
    if (active.current) downloadAnalysisExport(createAnalysisExport(active.current));
  };

  return (
    <div
      className="app-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <AppHeader
        tab={tab}
        libraryCount={library.length}
        onNavigate={(next) => void navigate(next)}
        onImport={importAudio}
      />
      <input
        ref={input}
        className="file-input"
        aria-label="Import audio file"
        type="file"
        accept="audio/*,.flac,.aiff,.opus"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = '';
        }}
      />
      <main>
        {(tab === 'legacy' || tab === 'whole-saved') && active.error && (
          <SessionError message={active.error} onDismiss={() => activeController.clearError()} />
        )}
        {tab === 'search' || tab === 'file' ? (
          <SearchAnalyzeStage
            search={songSearch}
            session={wholeController}
            localOnly={tab === 'file'}
            onLegacy={() => void navigate('legacy')}
          />
        ) : tab === 'listen' ? (
          <LiveListeningStage controller={liveController} />
        ) : tab === 'library' ? (
          <LibraryView records={library} onOpen={openRecord} onImport={importAudio} />
        ) : active.current ? (
          <>
            <TrackHeading
              record={active.current}
              saveState={active.saveState}
              onFavorite={() => void activeController.favorite()}
              onExport={exportAnalysis}
              onExportTimeline={() => {
                if (active.current) downloadAnalysisExport(createTimelineExport(active.current));
              }}
              onLibrary={() => void navigate('library')}
            />
            <PlaybackStage
              key={active.current.analysis.id}
              record={active.current}
              controller={activeController}
            />
            {tab === 'whole-saved' ? (
              <p className="analysis-note">
                Saved whole-song timeline. Import the same recording to restore playback and reuse
                this corrected analysis. Audio is not stored in the library.
              </p>
            ) : (
              <div className="session-options">
                <span>
                  Choose the profile for your next import. Existing sessions stay unchanged.
                </span>
                <AnalysisProfilePicker
                  profile={state.profile}
                  onChange={(profile) => controller.setProfile(profile)}
                />
              </div>
            )}
          </>
        ) : busy ? (
          <AnalysisProgress
            stage={state.stage}
            progress={state.progress}
            onCancel={() => controller.cancel()}
          />
        ) : (
          <WelcomeView
            profile={state.profile}
            records={library}
            onImport={importAudio}
            onDemo={() => void controller.demo()}
            onProfile={(profile) => controller.setProfile(profile)}
            onOpen={openRecord}
          />
        )}
      </main>
      <AppFooter />
    </div>
  );
}
