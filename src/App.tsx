import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ClipboardCheck, ClipboardCopy, FileText, Menu } from 'lucide-react';
import { Page } from './types';
import { STORAGE_KEY, loadPages, mergePages, savePages, uid } from './storage';
import { copyText, pageToMarkdown } from './markdown';
import { welcomeBlocks } from './templates';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import QuickSwitcher from './components/QuickSwitcher';

function seed(): Page[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      title: 'Welcome to NoteMaxx',
      blocks: welcomeBlocks(),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

const initialPages = loadPages() ?? seed();

export default function App() {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [activeId, setActiveId] = useState<string | null>(initialPages[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [saveOk, setSaveOk] = useState(true);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const copyTimer = useRef<number>();
  const saveTimer = useRef<number>();
  const pendingSince = useRef<number | null>(null);
  const pagesRef = useRef(pages);
  const switcherOpenRef = useRef(false);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    switcherOpenRef.current = switcherOpen;
  }, [switcherOpen]);

  const openSwitcher = () => {
    prevFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSwitcherOpen(true);
  };

  const closeSwitcher = (restoreFocus: boolean) => {
    setSwitcherOpen(false);
    if (restoreFocus && prevFocus.current?.isConnected) prevFocus.current.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === 'k' || e.key === 'p')
      ) {
        e.preventDefault();
        if (e.repeat) return;
        if (switcherOpenRef.current) closeSwitcher(true);
        else openSwitcher();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced save with a 1s max-wait so continuous typing still persists.
  useEffect(() => {
    if (pendingSince.current === null) pendingSince.current = Date.now();
    const delay = Date.now() - pendingSince.current >= 1000 ? 0 : 250;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      pendingSince.current = null;
      setSaveOk(savePages(pagesRef.current));
    }, delay);
    return () => window.clearTimeout(saveTimer.current);
  }, [pages]);

  // Flush pending edits when the tab hides or unloads.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      pendingSince.current = null;
      setSaveOk(savePages(pagesRef.current));
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Adopt writes from other tabs (page-level last-writer-wins).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue);
        if (!Array.isArray(incoming)) return;
        setPages((current) => mergePages(incoming, current));
      } catch {
        // malformed external write — keep local state
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const active = pages.find((p) => p.id === activeId) ?? null;

  const updatePage = (id: string, patch: Partial<Page>) =>
    setPages((ps) =>
      ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    );

  const togglePin = (id: string) =>
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)));

  const createPage = (title = '') => {
    const now = Date.now();
    const p: Page = {
      id: uid(),
      title,
      blocks: [{ id: uid(), type: 'p', text: '' }],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setPages((ps) => [p, ...ps]);
    setActiveId(p.id);
    setSearch('');
    setNavOpen(false);
  };

  const duplicatePage = (id: string) => {
    const src = pages.find((p) => p.id === id);
    if (!src) return;
    const now = Date.now();
    const copy: Page = {
      ...src,
      id: uid(),
      title: `${src.title || 'Untitled'} (copy)`,
      blocks: src.blocks.map((b) => ({ ...b, id: uid() })),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setPages((ps) => [copy, ...ps]);
    setActiveId(copy.id);
    setNavOpen(false);
  };

  const deletePage = (id: string) => {
    const target = pages.find((p) => p.id === id);
    if (!window.confirm(`Delete "${target?.title || 'Untitled'}"? This can't be undone.`)) return;
    const next = pages.filter((p) => p.id !== id);
    setPages(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const selectPage = (id: string) => {
    setActiveId(id);
    setNavOpen(false);
  };

  // The COPIED/COPY FAILED label describes the page it was clicked on — clear
  // it when the active page changes so it can't misattribute the clipboard.
  useEffect(() => {
    setCopied('idle');
    window.clearTimeout(copyTimer.current);
  }, [activeId]);

  const copyAsMarkdown = async () => {
    if (!active) return;
    const ok = await copyText(pageToMarkdown(active));
    setCopied(ok ? 'ok' : 'fail');
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied('idle'), 1800);
  };

  return (
    <div className="app">
      <Sidebar
        pages={pages}
        activeId={activeId}
        search={search}
        setSearch={setSearch}
        onSelect={selectPage}
        onCreate={() => createPage()}
        onDelete={deletePage}
        onDuplicate={duplicatePage}
        onTogglePin={togglePin}
        open={navOpen}
      />
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
      <main className="main">
        <header className="topbar">
          <button
            className="nav-toggle"
            aria-label="Toggle sidebar"
            onClick={() => setNavOpen((o) => !o)}
          >
            <Menu size={15} />
          </button>
          <span className="crumb-root">NOTEMAXX</span>
          {active && (
            <>
              <ChevronRight size={11} className="crumb-sep" />
              <span className="crumb-page">{active.title || 'Untitled'}</span>
            </>
          )}
          <div className="topbar-spacer" />
          {active && (
            <button
              className={`topbar-btn${copied === 'ok' ? ' ok' : ''}`}
              onClick={copyAsMarkdown}
              title="Copy page as Markdown"
            >
              {copied === 'ok' ? <ClipboardCheck size={12} /> : <ClipboardCopy size={12} />}
              {copied === 'ok' ? 'COPIED' : copied === 'fail' ? 'COPY FAILED' : 'COPY MD'}
            </button>
          )}
          <span className={`saved-chip${saveOk ? '' : ' err'}`}>
            <span className="saved-dot" />
            {saveOk ? 'SAVED LOCALLY' : 'SAVE FAILED'}
          </span>
        </header>
        {active ? (
          <Editor
            key={active.id}
            page={active}
            onChange={(patch) => updatePage(active.id, patch)}
          />
        ) : (
          <div className="empty-state">
            <FileText size={26} strokeWidth={1.5} />
            <p>No page selected</p>
            <button className="btn-primary" onClick={() => createPage()}>
              New page
            </button>
          </div>
        )}
      </main>
      {switcherOpen && (
        <QuickSwitcher
          pages={pages}
          onPick={(id) => {
            if (id === activeId) {
              closeSwitcher(true);
            } else {
              setActiveId(id);
              closeSwitcher(false);
            }
          }}
          onCreate={(title) => {
            createPage(title);
            closeSwitcher(false);
          }}
          onClose={() => closeSwitcher(true)}
        />
      )}
    </div>
  );
}
