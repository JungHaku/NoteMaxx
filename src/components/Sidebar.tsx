import { Copy, FileText, Pin, Plus, Search, Trash2 } from 'lucide-react';
import { Page } from '../types';
import { pageMatches } from '../search';

interface Props {
  pages: Page[];
  activeId: string | null;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onTogglePin: (id: string) => void;
  open: boolean;
}

function rel(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  pages,
  activeId,
  search,
  setSearch,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  onTogglePin,
  open,
}: Props) {
  const q = search.trim().toLowerCase();
  const filtered = q ? pages.filter((p) => pageMatches(p, q)) : pages;
  const byTime = (a: Page, b: Page) => b.updatedAt - a.updatedAt;
  const pinned = filtered.filter((p) => p.pinned).sort(byTime);
  const rest = filtered.filter((p) => !p.pinned).sort(byTime);

  const row = (p: Page) => (
    <div
      key={p.id}
      role="button"
      tabIndex={0}
      className={`page-row${p.id === activeId ? ' active' : ''}`}
      onClick={() => onSelect(p.id)}
      onKeyDown={(e) => {
        // only when the row itself is focused — inner action buttons (pin,
        // duplicate, delete) keep their native Enter/Space activation
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(p.id);
        }
      }}
    >
      <FileText size={13} className="row-icon" />
      <span className="row-title">{p.title || 'Untitled'}</span>
      <span className="row-time">{rel(p.updatedAt)}</span>
      <span className="row-actions">
        <button
          title={p.pinned ? 'Unpin' : 'Pin'}
          aria-label={p.pinned ? 'Unpin page' : 'Pin page'}
          className={p.pinned ? 'pinned' : ''}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(p.id);
          }}
        >
          <Pin size={12} />
        </button>
        <button
          title="Duplicate"
          aria-label="Duplicate page"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(p.id);
          }}
        >
          <Copy size={12} />
        </button>
        <button
          title="Delete"
          aria-label="Delete page"
          className="danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(p.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </span>
    </div>
  );

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">N</div>
        <span className="brand-name">NoteMaxx</span>
      </div>
      <div className="search-box">
        <Search size={13} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
        />
      </div>
      <button className="new-btn" onClick={onCreate}>
        <Plus size={14} />
        New page
      </button>
      <nav className="page-list">
        {pinned.length > 0 && (
          <>
            <div className="nav-label">Pinned</div>
            {pinned.map(row)}
          </>
        )}
        <div className="nav-label">{q ? `Results (${filtered.length})` : 'Pages'}</div>
        {rest.length === 0 && pinned.length === 0 && (
          <div className="list-empty">{q ? 'No matches' : 'No pages yet'}</div>
        )}
        {rest.map(row)}
      </nav>
      <div className="sidebar-foot">
        <span>LOCAL WORKSPACE</span>
        <span>
          {pages.length} {pages.length === 1 ? 'PAGE' : 'PAGES'}
        </span>
      </div>
    </aside>
  );
}
