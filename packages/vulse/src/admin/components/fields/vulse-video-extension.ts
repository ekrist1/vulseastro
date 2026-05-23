import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { sanitizeMediaSrc } from './url-utils.js';
import VulseVideoNodeView from './VulseVideoNodeView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseVideo: {
      insertVulseVideo: (src?: string) => ReturnType;
    };
  }
}

export const VulseVideoExtension = Node.create({
  name: 'vulseVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          sanitizeMediaSrc(element.getAttribute('src') ?? '') ?? null,
        renderHTML: (attrs: { src?: string | null }) => (attrs.src ? { src: attrs.src } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'video[data-vulse-embed="video"]' }, { tag: 'video[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(
        {
          'data-vulse-embed': 'video',
          controls: 'true',
          preload: 'metadata',
        },
        HTMLAttributes,
      ),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(VulseVideoNodeView);
  },

  addCommands() {
    return {
      insertVulseVideo:
        (src = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { src: sanitizeMediaSrc(src) },
          }),
    };
  },
});
