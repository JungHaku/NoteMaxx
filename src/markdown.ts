import { Block, Page } from './types';

const LIST_TYPES = new Set(['bullet', 'number', 'todo']);

function prefixLines(text: string, first: string, cont: string): string {
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? first + l : cont + l))
    .join('\n');
}

// A fence longer than any backtick run in the text, so embedded ``` can't
// terminate the block early.
function fenceFor(text: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function blockToMd(b: Block, num: number): string {
  const oneLine = (t: string) => t.replace(/\n+/g, ' ');
  switch (b.type) {
    case 'h1':
      return `# ${oneLine(b.text)}`;
    case 'h2':
      return `## ${oneLine(b.text)}`;
    case 'h3':
      return `### ${oneLine(b.text)}`;
    case 'bullet':
      return prefixLines(b.text, '- ', '  ');
    case 'number': {
      const marker = `${num}. `;
      return prefixLines(b.text, marker, ' '.repeat(marker.length));
    }
    case 'todo':
      return prefixLines(b.text, b.checked ? '- [x] ' : '- [ ] ', '      ');
    case 'code': {
      const f = fenceFor(b.text);
      return `${f}\n${b.text}\n${f}`;
    }
    case 'quote':
      return prefixLines(b.text, '> ', '> ');
    case 'callout':
      return prefixLines(b.text, '> **Note:** ', '> ');
    case 'divider':
      return '---';
    case 'image':
      return b.file ? `![${b.file.name}](${encodeURI(b.file.name)})` : '';
    case 'file':
      return b.file ? `[${b.file.name}](${encodeURI(b.file.name)})` : '';
    default:
      return b.text;
  }
}

export function blocksToMarkdown(blocks: Block[], lead = ''): string {
  let out = lead;
  let num = 0;
  let prevList = false;
  for (const b of blocks) {
    num = b.type === 'number' ? num + 1 : 0;
    const isList = LIST_TYPES.has(b.type);
    const sep = out === '' ? '' : isList && prevList ? '\n' : '\n\n';
    out += sep + blockToMd(b, num);
    prevList = isList;
  }
  return out.trimEnd() + '\n';
}

export function pageToMarkdown(page: Page): string {
  let out = `# ${page.title || 'Untitled'}`;
  let num = 0;
  let prevList = false;
  for (const b of page.blocks) {
    num = b.type === 'number' ? num + 1 : 0;
    const isList = LIST_TYPES.has(b.type);
    // single newline between consecutive list items, blank line otherwise —
    // separators only; block bodies (code especially) are never rewritten
    out += (isList && prevList ? '\n' : '\n\n') + blockToMd(b, num);
    prevList = isList;
  }
  return out.trimEnd() + '\n';
}

export async function copyText(text: string): Promise<boolean> {
  // execCommand first: it is synchronous, so it runs inside the click's user
  // activation — in WKWebView the async clipboard API can reject after the
  // activation window has closed, which would strand us with no working path.
  const prevFocus = document.activeElement;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (prevFocus instanceof HTMLElement) prevFocus.focus();
    if (ok) return true;
  } catch {
    // fall through to the async API
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
