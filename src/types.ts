export type BlockType =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'number'
  | 'todo'
  | 'code'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'image'
  | 'file';

export interface FileRef {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  /** Attachment for 'image' / 'file' blocks; bytes live in IndexedDB. */
  file?: FileRef;
}

/** Blocks with no editable text — skipped when moving the caret. */
export const VOID_TYPES: BlockType[] = ['divider', 'image', 'file'];

export const isVoid = (t: BlockType) => VOID_TYPES.includes(t);

export interface Page {
  id: string;
  title: string;
  blocks: Block[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
