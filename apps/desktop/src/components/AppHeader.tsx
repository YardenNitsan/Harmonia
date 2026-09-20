import { AudioLines, Headphones, Library, Search, ShieldCheck, Upload } from 'lucide-react';

export type AppTab = 'search' | 'listen' | 'file' | 'whole-saved' | 'legacy' | 'library';

export function AppHeader({
  tab,
  libraryCount,
  onNavigate,
  onImport,
}: {
  tab: AppTab;
  libraryCount: number;
  onNavigate: (tab: AppTab) => void;
  onImport: () => void;
}) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="#"
        aria-label="Harmonia home"
        onClick={(event) => {
          event.preventDefault();
          onNavigate('search');
        }}
      >
        <AudioLines size={28} strokeWidth={1.5} />
        <span>
          harmonia<span className="brand-dot">.</span>
        </span>
      </a>
      <nav aria-label="Main navigation">
        <button className={tab === 'search' ? 'active' : ''} onClick={() => onNavigate('search')}>
          <Search size={15} /> Search & Analyze
        </button>
        <button
          className={tab === 'file' || tab === 'whole-saved' ? 'active' : ''}
          onClick={() => onNavigate('file')}
        >
          <AudioLines size={15} /> File analysis
        </button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => onNavigate('library')}>
          <Library size={15} /> Library <small>{libraryCount}</small>
        </button>
        <button
          className={tab === 'listen' ? 'active' : ''}
          onClick={() => onNavigate('listen')}
          title="Experimental live recognition"
        >
          <Headphones size={15} /> Listen Live
        </button>
      </nav>
      <div className="topbar-right">
        <span className="local-badge">
          <ShieldCheck size={14} /> Local by nature
        </span>
        <button className="import-button" onClick={onImport}>
          <Upload size={14} /> Import audio
        </button>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <span>
        <span className="tiny-dot" /> All processing on your device
      </span>
      <span>Built for the moments between the notes.</span>
      <span>HARMONIA / EARLY DEVELOPMENT</span>
    </footer>
  );
}
