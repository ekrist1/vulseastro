import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    emoji: {
      insertEmoji: (value: string, label?: string) => ReturnType;
    };
  }
}

export const EmojiExtension = Node.create({
  name: 'emoji',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      value: {
        default: '🙂',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-value') ?? element.textContent ?? '🙂',
        renderHTML: (attrs: { value: string }) => ({ 'data-value': attrs.value }),
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('aria-label'),
        renderHTML: (attrs: { label?: string | null }) =>
          attrs.label ? { 'aria-label': attrs.label } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-vulse-emoji]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const value = (HTMLAttributes['data-value'] as string | undefined) ?? '🙂';
    return ['span', mergeAttributes(HTMLAttributes, { 'data-vulse-emoji': '' }), value];
  },

  addCommands() {
    return {
      insertEmoji:
        (value: string, label?: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { value, ...(label ? { label } : {}) },
          }),
    };
  },
});
