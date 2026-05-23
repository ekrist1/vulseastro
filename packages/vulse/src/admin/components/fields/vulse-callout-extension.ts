import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import VulseCalloutNodeView from './VulseCalloutNodeView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseCallout: {
      insertVulseCallout: (tone?: 'info' | 'warn') => ReturnType;
    };
  }
}

export const VulseCalloutExtension = Node.create({
  name: 'vulseCallout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-tone') ?? 'info',
        renderHTML: (attrs: { tone: string }) => ({ 'data-tone': attrs.tone }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-vulse-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-vulse-callout': '' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(VulseCalloutNodeView);
  },

  addCommands() {
    return {
      insertVulseCallout:
        (tone: 'info' | 'warn' = 'info') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { tone },
            content: [{ type: 'paragraph' }],
          }),
    };
  },
});
