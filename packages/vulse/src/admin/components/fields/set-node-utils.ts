import type { JSONContent } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/vue-3';

function nodePos(props: NodeViewProps): number | null {
  const pos = props.getPos();
  return typeof pos === 'number' ? pos : null;
}

function nodeEndPos(props: NodeViewProps): number | null {
  const pos = nodePos(props);
  return pos === null ? null : pos + props.node.nodeSize;
}

function nodeContentEndPos(props: NodeViewProps): number | null {
  const pos = nodePos(props);
  return pos === null ? null : pos + props.node.nodeSize - 1;
}

export function insertContentAfter(
  props: NodeViewProps,
  content: JSONContent | JSONContent[],
): void {
  const after = nodeEndPos(props);
  if (after === null) return;
  props.editor.chain().focus().insertContentAt(after, content).run();
}

export function appendContentInside(
  props: NodeViewProps,
  content: JSONContent | JSONContent[],
): void {
  const end = nodeContentEndPos(props);
  if (end === null) return;
  props.editor.chain().focus().insertContentAt(end, content).run();
}

export function insertParagraphAfter(props: NodeViewProps): void {
  const after = nodeEndPos(props);
  if (after === null) return;
  props.editor
    .chain()
    .focus()
    .insertContentAt(after, { type: 'paragraph' })
    .setTextSelection(after + 1)
    .run();
}

export function deleteCurrentNode(props: NodeViewProps): void {
  props.deleteNode();
}

export function parentNodeInfo(props: NodeViewProps): {
  name: string;
  childCount: number;
  index: number;
  pos: number | null;
} | null {
  const pos = nodePos(props);
  const doc = props.editor.state?.doc;
  if (pos === null || !doc || typeof doc.resolve !== 'function') return null;

  const $pos = doc.resolve(pos);
  if ($pos.depth < 1) return null;

  return {
    name: $pos.parent.type.name,
    childCount: $pos.parent.childCount,
    index: $pos.index($pos.depth),
    pos: $pos.before($pos.depth),
  };
}

export function deleteCurrentNodeOrParentIfOnlyChild(
  props: NodeViewProps,
  parentName: string,
): void {
  const parent = parentNodeInfo(props);
  const doc = props.editor.state?.doc;
  if (
    parent?.name === parentName &&
    parent.childCount === 1 &&
    parent.pos !== null &&
    doc &&
    typeof doc.nodeAt === 'function'
  ) {
    const parentNode = doc.nodeAt(parent.pos);
    if (!parentNode) {
      props.deleteNode();
      return;
    }

    props.editor
      .chain()
      .focus()
      .deleteRange({ from: parent.pos, to: parent.pos + parentNode.nodeSize })
      .run();
    return;
  }

  props.deleteNode();
}
