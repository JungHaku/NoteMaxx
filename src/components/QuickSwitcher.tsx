import { useEffect, useRef, useState } from 'react';
import { FilePlus2, FileText, Search } from 'lucide-react';
import { Page } from '../types';
import { rankPages } from '../search';

interface Props {
  pages: Page[];
  onPick: (id: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}

function rel(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function QuickSwitcher({ pages, onPick, onCreate, onClose }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = rankPages(pages, q);
  const showCreate = q.trim().length > 0;
  const total = results.length + (showCreate ? 1 : 0);
  const active = total === 0 ? -1 : Math.min(idx, total - 1);

  const pick = (i: number) => {
    if (i < 0) return;
    if (i < results.length) onPick(results[i].id);
    else if (showCreate) onCreate(q.trim());
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; // IME composition — never steal Enter/arrows
    if (e.key === 'Tab') {
      e.preventDefault(); // keep focus inside the modal; arrows are the navigation
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (total) setIdx((active + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (total) setIdx((active - 1 + total) % total);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="qs-overlay" onMouseDown={onClose}>
      <div
        className="qs-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="qs-input-row">
          <Search size={15} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Jump to a page…"
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            aria-label="Quick switcher"
          />
        </div>
        <div className="qs-list">
          {results.map((p, i) => (
            <button
              key={p.id}
              className={`qs-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(i)}
            >
              <FileText size={14} className="qs-icon" />
              <span className="qs-title">{p.title || 'Untitled'}</span>
              <span className="qs-time">{rel(p.updatedAt)}</span>
            </button>
          ))}
          {showCreate && (
            <button
              className={`qs-item qs-create${active === results.length ? ' active' : ''}`}
              onMouseEnter={() => setIdx(results.length)}
              onClick={() => pick(results.length)}
            >
              <FilePlus2 size={14} className="qs-icon" />
              <span className="qs-title">
                Create page “{q.trim()}”
              </span>
            </button>
          )}
          {total === 0 && <div className="qs-empty">No pages found</div>}
        </div>
        <div className="qs-foot">↑↓ NAVIGATE · ↵ OPEN · ESC CLOSE</div>
      </div>
    </div>
  );
}
