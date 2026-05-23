import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import VulseSetNodeView from './VulseSetNodeView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseSet: {
      insertVulseSet: (setHandle: string) => ReturnType;
    };
  }
}

export const VulseSetExtension = Node.create({
  name: 'vulseSet',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      set: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-vulse-set'),
        renderHTML: (attrs: { set: string | null }) => ({ 'data-vulse-set': attrs.set ?? '' }),
      },
      data: {
        default: {} as Record<string, unknown>,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-vulse-data');
          try {
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {};
          }
        },
        renderHTML: (attrs: { data: Record<string, unknown> }) => ({
          'data-vulse-data': JSON.stringify(attrs.data ?? {}),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-vulse-set]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-vulse-set': '' })];
  },

  addNodeView() {
    return VueNodeViewRenderer(VulseSetNodeView);
  },

  addCommands() {
    return {
      insertVulseSet:
        (setHandle: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { set: setHandle, data: {} },
          }),
    };
  },
});
