import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import VulseAccordionNodeView from './VulseAccordionNodeView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseAccordion: {
      insertVulseAccordion: (summary?: string) => ReturnType;
    };
  }
}

export const VulseAccordionExtension = Node.create({
  name: 'vulseAccordion',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      summary: {
        default: 'Accordion',
        parseHTML: (element: HTMLElement) =>
          element.querySelector('summary')?.textContent?.trim() || 'Accordion',
        renderHTML: (attrs: { summary?: string }) => ({
          'data-summary': attrs.summary ?? 'Accordion',
        }),
      },
      open: {
        default: false,
        parseHTML: (element: HTMLElement) => element.hasAttribute('open'),
        renderHTML: (attrs: { open?: boolean }) => (attrs.open ? { open: 'open' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details[data-vulse-accordion]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { summary = 'Accordion', ...rest } = HTMLAttributes;
    return [
      'details',
      mergeAttributes(rest, { 'data-vulse-accordion': '' }),
      ['summary', {}, String(summary)],
      ['div', { 'data-vulse-accordion-content': '' }, 0],
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(VulseAccordionNodeView);
  },

  addCommands() {
    return {
      insertVulseAccordion:
        (summary = 'Accordion') =>
        ({ commands }) =>
          commands.insertVulseAccordionGroup(summary),
    };
  },
});
