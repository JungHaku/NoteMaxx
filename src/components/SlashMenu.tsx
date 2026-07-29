import { ReactNode } from 'react';
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Paperclip,
  List,
  ListOrdered,
  Minus,
  Quote,
  Type,
} from 'lucide-react';
import { BlockType } from '../types';

export interface SlashCommand {
  type: BlockType;
  label: string;
  keywords: string;
  desc: string;
  icon: ReactNode;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { type: 'p', label: 'Text', keywords: 'paragraph plain', desc: 'Plain text', icon: <Type size={14} /> },
  { type: 'h1', label: 'Heading 1', keywords: 'h1 title big', desc: 'Large section heading', icon: <Heading1 size={14} /> },
  { type: 'h2', label: 'Heading 2', keywords: 'h2 section', desc: 'Medium section heading', icon: <Heading2 size={14} /> },
  { type: 'h3', label: 'Heading 3', keywords: 'h3 subsection', desc: 'Small section heading', icon: <Heading3 size={14} /> },
  { type: 'todo', label: 'To-do', keywords: 'todo task checkbox action item', desc: 'Checkbox task', icon: <CheckSquare size={14} /> },
  { type: 'bullet', label: 'Bulleted list', keywords: 'ul list unordered', desc: 'Simple bullet list', icon: <List size={14} /> },
  { type: 'number', label: 'Numbered list', keywords: 'ol ordered steps', desc: 'Numbered list', icon: <ListOrdered size={14} /> },
  { type: 'code', label: 'Code', keywords: 'snippet sql python shell terminal command', desc: 'Monospace code block', icon: <Code2 size={14} /> },
  { type: 'quote', label: 'Quote', keywords: 'blockquote citation', desc: 'Pull quote', icon: <Quote size={14} /> },
  { type: 'callout', label: 'Callout', keywords: 'note warning info highlight banner', desc: 'Highlighted note', icon: <Info size={14} /> },
  { type: 'divider', label: 'Divider', keywords: 'hr separator line rule', desc: 'Horizontal rule', icon: <Minus size={14} /> },
  { type: 'image', label: 'Image', keywords: 'image picture photo png jpg jpeg screenshot upload', desc: 'Embed a picture', icon: <ImageIcon size={14} /> },
  { type: 'file', label: 'File', keywords: 'file attachment upload pdf doc docx word excel csv md zip', desc: 'Attach any file', icon: <Paperclip size={14} /> },
];

export function filterCommands(q: string): SlashCommand[] {
  const s = q.trim().toLowerCase();
  if (!s) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(s));
}

interface Props {
  query: string;
  index: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
}

export default function SlashMenu({ query, index, onPick, onHover }: Props) {
  const cmds = filterCommands(query);
  return (
    <div className="slash-menu" onMouseDown={(e) => e.preventDefault()}>
      <div className="slash-title">Blocks</div>
      {cmds.length === 0 && <div className="slash-empty">No matches</div>}
      {cmds.map((c, i) => (
        <button
          key={c.label}
          className={`slash-item${i === index ? ' active' : ''}`}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(c)}
        >
          <span className="slash-icon">{c.icon}</span>
          <span className="slash-label">{c.label}</span>
          <span className="slash-desc">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
