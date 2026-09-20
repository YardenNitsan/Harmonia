import { useRef, useState, useSyncExternalStore } from 'react';
import { Search, Music2 } from 'lucide-react';
import type { SongSearchController } from '../../../../packages/application/song-search';
import type { SessionController } from '../../../../packages/application/session';
import { PlaybackStage } from './PlaybackStage';
import { AnalysisProgress } from './SessionStatus';
import { timeLabel } from './Timeline';

export function SearchAnalyzeStage({
  search,
  session,
  localOnly = false,
  onLegacy,
}: {
  search: SongSearchController;
  session: SessionController;
  localOnly?: boolean;
  onLegacy(): void;
}) {
  const state = useSyncExternalStore(search.subscribe, search.snapshot);
  const analysis = useSyncExternalStore(session.subscribe, session.snapshot);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<'commons' | 'youtube'>('commons');
  const [key, setKey] = useState('');
  const [searched, setSearched] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const busy = state.status === 'downloading' || state.status === 'analyzing';
  const current = state.status === 'ready' ? analysis.current : null;
  return (
    <div className="song-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE WHOLE SONG, IN CONTEXT</span>
          <h1>{localOnly ? 'Analyze a recording' : 'Search & Analyze'}</h1>
          <p>Prepare the complete chord timeline, then listen, explore and seek anywhere.</p>
        </div>
        <span className="tag">WHOLE-SONG PROTOTYPE</span>
      </div>
      {!localOnly && (
        <form
          className="song-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearched(true);
            void search.search(query, provider, key);
          }}
        >
          <label>
            Music source
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as typeof provider)}
              disabled={busy}
            >
              <option value="commons">Open recordings · Wikimedia Commons</option>
              <option value="youtube">YouTube · official metadata search</option>
            </select>
          </label>
          <label className="song-query">
            Song or artist
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={160}
              placeholder="Try Greensleeves, Bach or piano"
              required
              disabled={busy}
            />
          </label>
          <button className="primary" type="submit" disabled={busy || state.status === 'searching'}>
            <Search size={16} />
            {state.status === 'searching' ? 'Searching…' : 'Search songs'}
          </button>
          {provider === 'youtube' && (
            <div className="song-source-explanation">
              <label>
                YouTube Data API key
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  maxLength={256}
                />
              </label>
              <p>
                Kept only for this session. YouTube provides search and playback, not analysis
                audio. A separate permitted recording is required; Harmonia does not extract YouTube
                streams.
              </p>
            </div>
          )}
        </form>
      )}
      <div className="song-local-actions">
        <button className="secondary" onClick={() => file.current?.click()} disabled={busy}>
          Analyze local recording
        </button>
        {localOnly && (
          <button className="text-button" onClick={onLegacy}>
            Earlier analysis profiles
          </button>
        )}
        <span className="subtle">
          Full-track analysis stays on this device. Playback starts only when you choose Play.
        </span>
      </div>
      <input
        ref={file}
        type="file"
        className="file-input"
        aria-label="Whole-song audio file"
        accept="audio/*,.flac,.ogg,.oga"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) void search.local(selected);
          event.target.value = '';
        }}
      />
      {(state.error || analysis.error) && (
        <div role="alert" className="error-banner">
          {state.error ?? analysis.error}
        </div>
      )}
      {busy ? (
        <section aria-label="Whole-song preparation">
          <h2>Analyzing song…</h2>
          <p>{state.selected?.title ?? 'Your recording'}</p>
          <AnalysisProgress
            stage={
              state.status === 'downloading'
                ? 'Acquiring permitted recording'
                : analysis.stage || 'Preparing whole-song analysis'
            }
            progress={
              state.status === 'downloading'
                ? state.total
                  ? state.received / state.total
                  : 0
                : analysis.progress
            }
            onCancel={() => search.cancel()}
          />
        </section>
      ) : current ? (
        <>
          <div className="song-ready" role="status">
            <h2>{state.selected?.title ?? current.track.name}</h2>
            <p>
              Complete timeline ready · {timeLabel(current.analysis.duration)} ·{' '}
              {current.analysis.segments.length} chord segments · Preparation{' '}
              {state.elapsedSeconds?.toFixed(2)} s
            </p>
            {analysis.stage === 'Loaded cached analysis' && (
              <p>Loaded cached analysis · exact recording and analysis version matched.</p>
            )}
            <p>
              Global key and beats are estimates. Key changes, sections and downbeats are not yet
              inferred.
            </p>
          </div>
          {state.selected?.audio && (
            <p className="song-attribution">
              Recording: {state.selected.audio.attribution} ·{' '}
              <a href={state.selected.pageUrl} target="_blank" rel="noreferrer">
                Source and credits
              </a>{' '}
              ·{' '}
              <a href={state.selected.audio.licenseUrl} target="_blank" rel="noreferrer">
                {state.selected.audio.license}
              </a>
              . Analysis and playback use this same recording.
            </p>
          )}
          <PlaybackStage key={current.analysis.id} record={current} controller={session} />
        </>
      ) : state.status === 'input-required' ? (
        <section className="song-source-explanation" role="status">
          <h2>Analysis recording required</h2>
          <p>{state.selected?.title}</p>
          <p>
            This YouTube result does not include permitted analysis audio. No chord analysis has
            been run. Search open recordings, or analyze a local recording you are permitted to use.
            A different recording cannot automatically be synchronized to this video.
          </p>
          <a href={state.selected?.pageUrl} target="_blank" rel="noreferrer">
            Watch on YouTube
          </a>
        </section>
      ) : (
        !localOnly && (
          <>
            <p className="analysis-note">
              {provider === 'commons'
                ? 'Search openly licensed recordings. Choosing Analyze downloads the selected recording temporarily for local analysis and playback; attribution stays visible.'
                : 'Official YouTube metadata results. Analysis availability is separate from video playback.'}
            </p>
            <div className="song-results" aria-label="Song search results">
              {state.results.map((result) => (
                <article className="song-result" key={result.id}>
                  {result.thumbnail ? (
                    <img
                      src={result.thumbnail}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="song-art">
                      <Music2 size={30} />
                    </div>
                  )}
                  <div>
                    <h2>{result.title}</h2>
                    <p>{result.artist}</p>
                    <span className="subtle">
                      {result.duration === null
                        ? 'Duration unavailable'
                        : timeLabel(result.duration)}{' '}
                      · {result.audio?.license ?? 'Separate analysis recording required'}
                    </span>
                  </div>
                  <button className="secondary" onClick={() => void search.select(result)}>
                    {result.audio ? 'Analyze song' : 'Select video'}
                  </button>
                </article>
              ))}
            </div>
            {searched && state.status === 'idle' && state.results.length === 0 && (
              <p role="status">No supported recordings found. Try another title or artist.</p>
            )}
          </>
        )
      )}
    </div>
  );
}
