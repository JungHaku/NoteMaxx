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
  | 'divider';

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

export interface Page {
  id: string;
  title: string;
  blocks: Block[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
