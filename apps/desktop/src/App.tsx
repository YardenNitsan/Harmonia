import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SavedTrack } from '../../../packages/domain/types';
import { createAnalysisExport, createTimelineExport } from '../../../packages/application/export';
import { downloadAnalysisExport } from '../../../packages/providers/browser-export';
import { controller } from './composition';
import { AppFooter, AppHeader, type AppTab } from './components/AppHeader';
import { LibraryView } from './components/LibraryView';
import { PlaybackStage } from './components/PlaybackStage';
import { AnalysisProgress, SessionError } from './components/SessionStatus';
import { TrackHeading } from './components/TrackHeading';
import { WelcomeView } from './components/WelcomeView';
import { AnalysisProfilePicker } from './components/AnalysisProfilePicker';

export function App() {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<AppTab>('listen');
  useEffect(() => {
    void controller.initialize();
  }, []);
  const busy = state.status === 'preparing' || state.status === 'analyzing';
  const importAudio = () => input.current?.click();
  const importFile = (file: File) => {
    setTab('listen');
    void controller.importFile(file);
  };
  const openRecord = (record: SavedTrack) => {
    controller.open(record);
    setTab('listen');
  };
  const exportAnalysis = () => {
    if (state.current) downloadAnalysisExport(createAnalysisExport(state.current));
  };

  return (
    <div
      className="app-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) importFile(file);
      }}
    >
      <AppHeader
        tab={tab}
        libraryCount={state.library.length}
        onNavigate={setTab}
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
          if (file) importFile(file);
          event.target.value = '';
        }}
      />
      <main>
        {state.error && (
          <SessionError message={state.error} onDismiss={() => controller.clearError()} />
        )}
        {tab === 'library' ? (
          <LibraryView records={state.library} onOpen={openRecord} onImport={importAudio} />
        ) : state.current ? (
          <>
            <TrackHeading
              record={state.current}
              saveState={state.saveState}
              onFavorite={() => void controller.favorite()}
              onExport={exportAnalysis}
              onExportTimeline={() => {
                if (state.current) downloadAnalysisExport(createTimelineExport(state.current));
              }}
              onLibrary={() => setTab('library')}
            />
            <PlaybackStage
              key={state.current.analysis.id}
              record={state.current}
              controller={controller}
            />
            <div className="session-options">
              <span>
                Choose the profile for your next import. Existing sessions stay unchanged.
              </span>
              <AnalysisProfilePicker
                profile={state.profile}
                onChange={(profile) => controller.setProfile(profile)}
              />
            </div>
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
            records={state.library}
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
