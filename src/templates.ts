import { Block, BlockType } from './types';
import { uid } from './storage';

const b = (type: BlockType, text = '', extra: Partial<Block> = {}): Block => ({
  id: uid(),
  type,
  text,
  ...extra,
});

export interface Template {
  id: string;
  name: string;
  desc: string;
  build: () => Block[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'meeting',
    name: 'Customer meeting',
    desc: 'Agenda, notes, action items',
    build: () => [
      b('callout', 'Customer:   ·   Date:   ·   Attendees: '),
      b('h2', 'Agenda'),
      b('bullet', ''),
      b('h2', 'Notes'),
      b('p', ''),
      b('h2', 'Action items'),
      b('todo', '', { checked: false }),
    ],
  },
  {
    id: 'runbook',
    name: 'Deployment runbook',
    desc: 'Steps, commands, rollback',
    build: () => [
      b('callout', 'Environment:   ·   Owner:   ·   Last verified: '),
      b('h2', 'Prerequisites'),
      b('todo', 'VPN + SSH access confirmed', { checked: false }),
      b('todo', 'Change window approved', { checked: false }),
      b('h2', 'Steps'),
      b('number', 'Snapshot current state'),
      b('number', 'Deploy'),
      b('code', '# commands go here\n'),
      b('h2', 'Rollback'),
      b('number', ''),
    ],
  },
  {
    id: 'incident',
    name: 'Incident log',
    desc: 'Timeline, impact, root cause',
    build: () => [
      b('callout', 'Severity:   ·   Status: Open   ·   Started: '),
      b('h2', 'Timeline'),
      b('bullet', ''),
      b('h2', 'Impact'),
      b('p', ''),
      b('h2', 'Root cause'),
      b('p', ''),
      b('h2', 'Follow-ups'),
      b('todo', '', { checked: false }),
    ],
  },
  {
    id: 'discovery',
    name: 'Discovery notes',
    desc: 'Problem, workflow, data sources',
    build: () => [
      b('h2', 'Problem statement'),
      b('p', ''),
      b('h2', 'Current workflow'),
      b('p', ''),
      b('h2', 'Data sources'),
      b('bullet', ''),
      b('h2', 'Open questions'),
      b('todo', '', { checked: false }),
    ],
  },
];

export function welcomeBlocks(): Block[] {
  return [
    b(
      'p',
      'NoteMaxx is a lightweight field notebook for forward-deployed work. Everything lives in this browser — no accounts, no sync, no waiting.'
    ),
    b('h2', 'Basics'),
    b('bullet', 'Type "/" in any empty block to insert headings, to-dos, code, callouts, and more'),
    b('bullet', 'Markdown shortcuts work too: "# ", "- ", "1. ", "[] ", "> ", "```"'),
    b('bullet', 'Enter splits a block · Backspace at the start merges it up'),
    b('bullet', 'Press ⌘K to jump between pages · drag the ⋮⋮ handle (or ⌘⇧↑/↓) to move blocks'),
    b('h2', 'Try it'),
    b('todo', 'Check this off', { checked: false }),
    b('code', "SELECT * FROM deployments WHERE status = 'live';"),
    b('callout', 'New pages offer templates: customer meetings, runbooks, incident logs, discovery notes.'),
  ];
}
