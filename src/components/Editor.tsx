import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Block, BlockType, Page } from '../types';
import { uid } from '../storage';
import { TEMPLATES, Template } from '../templates';
import BlockView from './BlockView';
import SlashMenu, { SlashCommand, filterCommands } from './SlashMenu';

interface Props {
  page: Page;
  onChange: (patch: Partial<Page>) => void;
}

type CaretPos = 'start' | 'end' | number;

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaret(el: HTMLElement, pos: CaretPos) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (pos === 'start') {
    range.selectNodeContents(el);
    range.collapse(true);
  } else if (pos === 'end') {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    let remaining = pos;
    let placed = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        placed = true;
        break;
      }
      remaining -= len;
    }
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretLineInfo(el: HTMLElement): { first: boolean; last: boolean } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { first: true, last: true };
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rects = r.getClientRects();
  const rect = rects.length ? rects[0] : null;
  if (!rect || rect.height === 0) return { first: true, last: true };
  const elRect = el.getBoundingClientRect();
  return {
    first: rect.top - elRect.top < rect.height * 0.8,
    last: elRect.bottom - rect.bottom < rect.height * 0.8,
  };
}

function tryMarkdown(text: string): { type: BlockType; rest: string } | null {
  const heading = text.match(/^(#{1,3}) (.*)$/s);
  if (heading) return { type: `h${heading[1].length}` as BlockType, rest: heading[2] };
  if (/^\[?\] /.test(text)) return { type: 'todo', rest: text.replace(/^\[ ?\] /, '') };
  if (/^[-*] /.test(text)) return { type: 'bullet', rest: text.slice(2) };
  if (/^1[.)] /.test(text)) return { type: 'number', rest: text.slice(3) };
  if (/^> /.test(text)) return { type: 'quote', rest: text.slice(2) };
  if (/^```/.test(text)) return { type: 'code', rest: text.slice(3) };
  if (/^---$/.test(text)) return { type: 'divider', rest: '' };
  return null;
}

const LIST_TYPES: BlockType[] = ['bullet', 'number', 'todo'];

const PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  p: "Type '/' for commands",
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  todo: 'To-do',
  bullet: 'List item',
  number: 'List item',
  quote: 'Quote',
  callout: 'Callout',
};

export default function Editor({ page, onChange }: Props) {
  const blockEls = useRef(new Map<string, HTMLElement>());
  const focusIntent = useRef<{ id: string; pos: CaretPos } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [slash, setSlash] = useState<{ blockId: string; query: string; index: number } | null>(
    null
  );
  const [drag, setDrag] = useState<{ id: string; overIndex: number; after: boolean } | null>(null);
  const blocksListRef = useRef<HTMLDivElement>(null);

  const register = (id: string, el: HTMLElement | null) => {
    if (el) blockEls.current.set(id, el);
    else blockEls.current.delete(id);
  };

  const focusEl = (id: string, pos: CaretPos) => {
    const el = blockEls.current.get(id);
    if (!el) return;
    if (el instanceof HTMLTextAreaElement) {
      el.focus();
      const p =
        pos === 'start' ? 0 : pos === 'end' ? el.value.length : Math.min(pos, el.value.length);
      el.setSelectionRange(p, p);
    } else {
      setCaret(el, pos);
    }
  };

  // Apply pending focus after the block list re-renders (child BlockView layout
  // effects sync text first, then this runs).
  useLayoutEffect(() => {
    const fi = focusIntent.current;
    if (!fi) return;
    focusIntent.current = null;
    focusEl(fi.id, fi.pos);
  });

  const isFresh =
    page.blocks.length === 1 && page.blocks[0].type === 'p' && page.blocks[0].text === '';

  // On page open: fresh untitled pages focus the title, everything else drops
  // the caret into the first block so a keyboard-only flow (⌘K → Enter → type)
  // never dead-ends on <body>.
  useEffect(() => {
    if (isFresh && !page.title) {
      titleRef.current?.focus();
    } else {
      const first = page.blocks.find((b) => b.type !== 'divider');
      if (first) focusEl(first.id, 'start');
    }
    setSlash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const idxOf = (id: string) => page.blocks.findIndex((b) => b.id === id);

  const update = (id: string, patch: Partial<Block>) =>
    onChange({ blocks: page.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  const handleText = (id: string, raw: string) => {
    const i = idxOf(id);
    if (i < 0) return;
    const block = page.blocks[i];

    if (block.type === 'code') {
      update(id, { text: raw });
      return;
    }

    const text = raw.replace(/\n$/, '');

    if (block.type === 'p') {
      const md = tryMarkdown(text);
      if (md) {
        setSlash(null);
        const el = blockEls.current.get(id);
        if (md.type === 'divider') {
          const np: Block = { id: uid(), type: 'p', text: '' };
          const blocks = [...page.blocks];
          blocks[i] = { ...block, type: 'divider', text: '' };
          blocks.splice(i + 1, 0, np);
          onChange({ blocks });
          focusIntent.current = { id: np.id, pos: 'start' };
          return;
        }
        if (el) {
          el.textContent = md.rest;
          setCaret(el, 'end');
        }
        const patch: Partial<Block> = { type: md.type, text: md.rest };
        if (md.type === 'todo') patch.checked = false;
        update(id, patch);
        return;
      }
    }

    if (text.startsWith('/')) {
      setSlash({ blockId: id, query: text.slice(1), index: 0 });
    } else if (slash) {
      setSlash(null);
    }
    update(id, { text });
  };

  const applySlash = (cmd: SlashCommand) => {
    if (!slash) return;
    const id = slash.blockId;
    const i = idxOf(id);
    setSlash(null);
    if (i < 0) return;
    const block = page.blocks[i];
    const el = blockEls.current.get(id);

    if (cmd.type === 'divider') {
      const np: Block = { id: uid(), type: 'p', text: '' };
      const blocks = [...page.blocks];
      blocks[i] = { ...block, type: 'divider', text: '' };
      blocks.splice(i + 1, 0, np);
      onChange({ blocks });
      focusIntent.current = { id: np.id, pos: 'start' };
      return;
    }

    if (el && !(el instanceof HTMLTextAreaElement)) el.textContent = '';
    const patch: Partial<Block> = { type: cmd.type, text: '' };
    if (cmd.type === 'todo') patch.checked = false;
    update(id, patch);
    focusIntent.current = { id, pos: 'start' };
  };

  const splitBlock = (i: number) => {
    const block = page.blocks[i];
    const el = blockEls.current.get(block.id);

    if (LIST_TYPES.includes(block.type) && block.text === '') {
      update(block.id, { type: 'p' });
      focusIntent.current = { id: block.id, pos: 'start' };
      return;
    }

    const off = el && !(el instanceof HTMLTextAreaElement) ? getCaretOffset(el) : block.text.length;
    const before = block.text.slice(0, off);
    const after = block.text.slice(off);
    const ntype: BlockType = LIST_TYPES.includes(block.type) ? block.type : 'p';
    const nb: Block = { id: uid(), type: ntype, text: after };
    if (ntype === 'todo') nb.checked = false;

    if (el && !(el instanceof HTMLTextAreaElement)) el.textContent = before;
    const blocks = [...page.blocks];
    blocks[i] = { ...block, text: before };
    blocks.splice(i + 1, 0, nb);
    onChange({ blocks });
    focusIntent.current = { id: nb.id, pos: 'start' };
  };

  const backspaceAtStart = (i: number) => {
    const block = page.blocks[i];

    if (block.type !== 'p') {
      update(block.id, { type: 'p', checked: undefined });
      focusIntent.current = { id: block.id, pos: 'start' };
      return;
    }
    if (i === 0) return;

    const prev = page.blocks[i - 1];
    if (prev.type === 'divider') {
      onChange({ blocks: page.blocks.filter((b) => b.id !== prev.id) });
      focusIntent.current = { id: block.id, pos: 'start' };
      return;
    }
    if (prev.type === 'code') {
      if (block.text === '') {
        onChange({ blocks: page.blocks.filter((b) => b.id !== block.id) });
        focusIntent.current = { id: prev.id, pos: 'end' };
      } else {
        focusEl(prev.id, 'end');
      }
      return;
    }

    const mergedPos = prev.text.length;
    const blocks = page.blocks
      .filter((b) => b.id !== block.id)
      .map((b) => (b.id === prev.id ? { ...b, text: prev.text + block.text } : b));
    onChange({ blocks });
    focusIntent.current = { id: prev.id, pos: mergedPos };
  };

  const insertAfter = (i: number) => {
    const nb: Block = { id: uid(), type: 'p', text: '' };
    const blocks = [...page.blocks];
    blocks.splice(i + 1, 0, nb);
    onChange({ blocks });
    focusIntent.current = { id: nb.id, pos: 'start' };
  };

  const removeBlockAt = (i: number) => {
    const removed = page.blocks[i];
    const blocks = page.blocks.filter((b) => b.id !== removed.id);
    if (blocks.length === 0) {
      const nb: Block = { id: uid(), type: 'p', text: '' };
      onChange({ blocks: [nb] });
      focusIntent.current = { id: nb.id, pos: 'start' };
      return;
    }
    onChange({ blocks });
    for (let j = i - 1; j >= 0; j--) {
      if (page.blocks[j].type !== 'divider') {
        focusIntent.current = { id: page.blocks[j].id, pos: 'end' };
        return;
      }
    }
    const next = page.blocks[i + 1];
    if (next) focusIntent.current = { id: next.id, pos: 'start' };
  };

  const focusNeighbor = (i: number, dir: -1 | 1) => {
    for (let j = i + dir; j >= 0 && j < page.blocks.length; j += dir) {
      if (page.blocks[j].type !== 'divider') {
        focusEl(page.blocks[j].id, dir === -1 ? 'end' : 'start');
        return true;
      }
    }
    return false;
  };

  // ⌘⇧↑ / ⌘⇧↓ — move the block, preserving the caret.
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= page.blocks.length) return;
    const block = page.blocks[i];
    const el = blockEls.current.get(block.id);
    let pos: CaretPos = 'end';
    if (el instanceof HTMLTextAreaElement) pos = el.selectionStart;
    else if (el) pos = getCaretOffset(el);
    const blocks = [...page.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    onChange({ blocks });
    focusIntent.current = { id: block.id, pos };
  };

  const handleDrop = (targetIndex: number, after: boolean) => {
    if (!drag) return;
    const from = idxOf(drag.id);
    setDrag(null);
    if (from < 0) return;
    let insert = targetIndex + (after ? 1 : 0);
    if (from < insert) insert--;
    if (insert === from) return;
    const blocks = [...page.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(insert, 0, moved);
    onChange({ blocks });
  };

  const handleKeyDown = (id: string, e: React.KeyboardEvent) => {
    const i = idxOf(id);
    if (i < 0) return;
    const block = page.blocks[i];
    const el = blockEls.current.get(id);

    if (
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    ) {
      // In code textareas, ⌘⇧↑/↓ keeps its native select-to-start/end meaning;
      // code blocks are still movable by drag.
      if (block.type === 'code') return;
      e.preventDefault();
      moveBlock(i, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (slash && slash.blockId === id) {
      const cmds = filterCommands(slash.query);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cmds.length) setSlash({ ...slash, index: (slash.index + 1) % cmds.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cmds.length) setSlash({ ...slash, index: (slash.index - 1 + cmds.length) % cmds.length });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (cmds.length) applySlash(cmds[Math.min(slash.index, cmds.length - 1)]);
        else setSlash(null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }

    if (block.type === 'code') {
      const ta = el as HTMLTextAreaElement | undefined;
      if (!ta) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        insertAfter(i);
        return;
      }
      if (e.key === 'Backspace' && ta.value === '') {
        e.preventDefault();
        removeBlockAt(i);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
        handleText(id, ta.value);
        return;
      }
      if (e.key === 'ArrowUp' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        if (focusNeighbor(i, -1)) e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length) {
        if (focusNeighbor(i, 1)) e.preventDefault();
        return;
      }
      return;
    }

    if (!el) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      splitBlock(i);
      return;
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if ((sel?.isCollapsed ?? true) && getCaretOffset(el) === 0) {
        e.preventDefault();
        backspaceAtStart(i);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (caretLineInfo(el).first) {
        if (i === 0) {
          e.preventDefault();
          titleRef.current?.focus();
        } else if (focusNeighbor(i, -1)) {
          e.preventDefault();
        }
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      if (caretLineInfo(el).last && focusNeighbor(i, 1)) e.preventDefault();
      return;
    }
  };

  const handleBlur = (id: string) => {
    if (slash && slash.blockId === id) setSlash(null);
  };

  const handleTitleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const first = page.blocks.find((b) => b.type !== 'divider');
      if (first) focusEl(first.id, 'start');
      else insertAfter(page.blocks.length - 1);
    }
  };

  const handleTailClick = () => {
    const last = page.blocks[page.blocks.length - 1];
    if (last && last.type === 'p' && last.text === '') {
      focusEl(last.id, 'end');
    } else {
      insertAfter(page.blocks.length - 1);
    }
  };

  const applyTemplate = (t: Template) => {
    const blocks = t.build();
    onChange({ blocks });
    focusIntent.current = { id: blocks[0].id, pos: 'end' };
  };

  // Consecutive-run numbering for ordered lists.
  const numberFor = (i: number): number => {
    let n = 1;
    for (let j = i - 1; j >= 0 && page.blocks[j].type === 'number'; j--) n++;
    return n;
  };

  const edited = new Date(page.updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // Dead-zone drag handling: the title/meta area and the tail below the last
  // block accept drops too, mapping to before-first / after-last.
  const deadZoneTarget = (e: React.DragEvent) => {
    const blocksEl = blocksListRef.current;
    if (!blocksEl) return null;
    const rect = blocksEl.getBoundingClientRect();
    return e.clientY < rect.top
      ? { overIndex: 0, after: false }
      : { overIndex: page.blocks.length - 1, after: true };
  };

  return (
    <div className="editor-scroll">
      <div
        className="editor-page"
        onDragOver={(e) => {
          if (!drag) return;
          if (e.target instanceof Element && e.target.closest('.block-row')) return;
          const t = deadZoneTarget(e);
          if (!t) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDrag((d) =>
            d && (d.overIndex !== t.overIndex || d.after !== t.after) ? { ...d, ...t } : d
          );
        }}
        onDrop={(e) => {
          if (!drag) return;
          if (e.target instanceof Element && e.target.closest('.block-row')) return;
          const t = deadZoneTarget(e);
          if (!t) return;
          e.preventDefault();
          handleDrop(t.overIndex, t.after);
        }}
        onDragLeave={(e) => {
          if (!drag) return;
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          setDrag((d) => (d && d.overIndex !== -1 ? { ...d, overIndex: -1 } : d));
        }}
      >
        <input
          ref={titleRef}
          className="page-title"
          value={page.title}
          placeholder="Untitled"
          onChange={(e) => onChange({ title: e.target.value })}
          onKeyDown={handleTitleKey}
          aria-label="Page title"
        />
        <div className="page-meta">
          EDITED {edited.toUpperCase()} · {page.blocks.length}{' '}
          {page.blocks.length === 1 ? 'BLOCK' : 'BLOCKS'}
        </div>

        {isFresh && (
          <div className="template-bar">
            <span className="template-label">Start from a template</span>
            <div className="template-chips">
              {TEMPLATES.map((t) => (
                <button key={t.id} className="template-chip" onClick={() => applyTemplate(t)} title={t.desc}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="blocks" ref={blocksListRef}>
          {page.blocks.map((b, i) => (
            <div
              className={`block-row${
                drag && drag.overIndex === i ? (drag.after ? ' drop-below' : ' drop-above') : ''
              }`}
              key={b.id}
              onBlur={() => handleBlur(b.id)}
              onDragOver={(e) => {
                if (!drag) return;
                if (drag.id === b.id) {
                  // self-drop is a no-op — clear the indicator, show no-drop cursor
                  setDrag((d) => (d && d.overIndex !== -1 ? { ...d, overIndex: -1 } : d));
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                setDrag((d) =>
                  d && (d.overIndex !== i || d.after !== after) ? { ...d, overIndex: i, after } : d
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                handleDrop(i, e.clientY > rect.top + rect.height / 2);
              }}
            >
              <span
                className="drag-handle"
                title="Drag to move (⌘⇧↑/↓ also works)"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  // custom MIME so a stray drop can't paste the id into text inputs
                  e.dataTransfer.setData('application/x-notemaxx-block', b.id);
                  const row = e.currentTarget.closest('.block-row');
                  if (row) e.dataTransfer.setDragImage(row, 0, 12);
                  setDrag({ id: b.id, overIndex: -1, after: false });
                }}
                onDragEnd={() => setDrag(null)}
              >
                <GripVertical size={13} />
              </span>
              <BlockView
                block={b}
                number={b.type === 'number' ? numberFor(i) : undefined}
                placeholder={PLACEHOLDERS[b.type] ?? ''}
                alwaysPlaceholder={b.type === 'p' && isFresh}
                register={register}
                onText={handleText}
                onKeyDown={handleKeyDown}
                onCheck={(id, checked) => update(id, { checked })}
              />
              {slash?.blockId === b.id && (
                <SlashMenu
                  query={slash.query}
                  index={slash.index}
                  onPick={applySlash}
                  onHover={(index) => setSlash({ ...slash, index })}
                />
              )}
            </div>
          ))}
        </div>

        <div className="editor-tail" onClick={handleTailClick} aria-hidden="true" />
      </div>
    </div>
  );
}
