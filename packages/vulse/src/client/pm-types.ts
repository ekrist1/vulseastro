import type { Component } from 'vue';

export interface BlockMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
  text?: string;
  marks?: BlockMark[];
}

export type BlockComponentMap = Record<string, Component>;

export interface BlockRendererProps {
  doc: BlockNode | BlockNode[];
  components?: BlockComponentMap;
}
