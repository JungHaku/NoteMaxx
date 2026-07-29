import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { Block } from '../types';
import { extLabel, formatSize, objectUrl, openFile } from '../files';

function Attachment({ block }: { block: Block }) {
  const ref = block.file;
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!ref) return;
    if (block.type !== 'image') return;
    objectUrl(ref.id).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, [ref?.id, block.type]);

  if (!ref) return <div className="block block-file broken">Attachment unavailable</div>;

  if (block.type === 'image') {
    return (
      <div className="block block-image">
        {missing ? (
          <div className="file-card broken">
            <span className="file-ext">IMG</span>
            <span className="file-name">{ref.name} — data missing</span>
          </div>
        ) : (
          <img
            src={url ?? undefined}
            alt={ref.name}
            title={`${ref.name} · ${formatSize(ref.size)}`}
            onClick={() => openFile(ref)}
            draggable={false}
          />
        )}
      </div>
    );
  }

  return (
    <div className="block block-file">
      <button
        className="file-card"
        onClick={() => openFile(ref)}
        title={`Open ${ref.name}`}
      >
        <span className="file-ext">{extLabel(ref)}</span>
        <span className="file-name">{ref.name}</span>
        <span className="file-size">{formatSize(ref.size)}</span>
        <ExternalLink size={13} className="file-open" />
      </button>
    </div>
  );
}

function autosize(ta: HTMLTextAreaElement | null) {
  if (!ta) return;
  ta.style.height = '0px';
  ta.style.height = `${ta.scrollHeight}px`;
}

interface Props {
  block: Block;
  number?: number;
  placeholder: string;
  alwaysPlaceholder?: boolean;
  register: (id: string, el: HTMLElement | null) => void;
  onText: (id: string, text: string) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent) => void;
  onCheck: (id: string, checked: boolean) => void;
}

export default function BlockView({
  block,
  number,
  placeholder,
  alwaysPlaceholder,
  register,
  onText,
  onKeyDown,
  onCheck,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync model → DOM only when the element isn't being typed in, so the caret
  // never jumps. Runs as a layout effect so it lands before the parent editor
  // moves focus after a merge/split.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) {
      const current = el.innerText.replace(/\n$/, '');
      if (current !== block.text) el.textContent = block.text;
    }
  }, [block.text, block.type]);

  useLayoutEffect(() => {
    autosize(taRef.current);
  }, [block.text, block.type]);

  // Re-measure when the column width changes (pane resize, sidebar toggle) —
  // a height computed against a stale width wraps wrong.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    let lastWidth = ta.clientWidth;
    const ro = new ResizeObserver(() => {
      if (ta.clientWidth !== lastWidth) {
        lastWidth = ta.clientWidth;
        autosize(ta);
      }
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [block.type]);

  if (block.type === 'image' || block.type === 'file') {
    return <Attachment block={block} />;
  }

  if (block.type === 'divider') {
    return (
      <div className="block block-divider">
        <hr />
      </div>
    );
  }

  if (block.type === 'code') {
    return (
      <div className="block block-code-wrap">
        <span className="code-tag">CODE</span>
        <textarea
          ref={(el) => {
            taRef.current = el;
            register(block.id, el);
          }}
          className="block-code"
          value={block.text}
          onChange={(e) => onText(block.id, e.target.value)}
          onKeyDown={(e) => onKeyDown(block.id, e)}
          spellCheck={false}
          rows={1}
          aria-label="Code block"
        />
      </div>
    );
  }

  const editable = (
    <div
      ref={(el) => {
        ref.current = el;
        register(block.id, el);
      }}
      className={`bt bt-${block.type}${alwaysPlaceholder ? ' bt-hint' : ''}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => {
        const el = e.currentTarget;
        let t = el.innerText;
        if (t === '\n' || t === '') {
          if (el.childNodes.length) el.textContent = '';
          t = '';
        }
        onText(block.id, t);
      }}
      onKeyDown={(e) => onKeyDown(block.id, e)}
    />
  );

  switch (block.type) {
    case 'todo':
      return (
        <div className={`block block-todo${block.checked ? ' done' : ''}`}>
          <input
            type="checkbox"
            checked={!!block.checked}
            onChange={(e) => onCheck(block.id, e.target.checked)}
            aria-label="Toggle to-do"
          />
          {editable}
        </div>
      );
    case 'bullet':
      return (
        <div className="block block-bullet">
          <span className="marker">•</span>
          {editable}
        </div>
      );
    case 'number':
      return (
        <div className="block block-number">
          <span className="marker">{number ?? 1}.</span>
          {editable}
        </div>
      );
    case 'quote':
      return <div className="block block-quote">{editable}</div>;
    case 'callout':
      return (
        <div className="block block-callout">
          <Info size={15} className="callout-icon" />
          {editable}
        </div>
      );
    default:
      return <div className={`block block-${block.type}`}>{editable}</div>;
  }
}
