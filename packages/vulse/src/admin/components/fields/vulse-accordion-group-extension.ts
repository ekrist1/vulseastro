import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import VulseAccordionGroupNodeView from './VulseAccordionGroupNodeView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseAccordionGroup: {
      insertVulseAccordionGroup: (summary?: string) => ReturnType;
    };
  }
}

export const VulseAccordionGroupExtension = Node.create({
  name: 'vulseAccordionGroup',
  group: 'block',
  content: 'vulseAccordion+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-vulse-accordion-group]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-vulse-accordion-group': '' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(VulseAccordionGroupNodeView);
  },

  addCommands() {
    return {
      insertVulseAccordionGroup:
        (summary = 'Accordion') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [
              {
                type: 'vulseAccordion',
                attrs: { summary, open: false },
                content: [{ type: 'paragraph' }],
              },
            ],
          }),
    };
  },
});
