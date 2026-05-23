import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { parseIframeCode, sanitizeMediaSrc } from './url-utils.js';
import VulseIframeNodeView from './VulseIframeNodeView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseIframe: {
      insertVulseIframe: (src?: string, title?: string) => ReturnType;
    };
  }
}

export const VulseIframeExtension = Node.create({
  name: 'vulseIframe',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: null,
        parseHTML: (element: HTMLElement) => element.outerHTML,
        renderHTML: () => ({}),
      },
      src: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          sanitizeMediaSrc(element.getAttribute('src') ?? '') ?? null,
        renderHTML: (attrs: { src?: string | null }) => (attrs.src ? { src: attrs.src } : {}),
      },
      title: {
        default: 'Embedded content',
        parseHTML: (element: HTMLElement) => element.getAttribute('title') ?? 'Embedded content',
        renderHTML: (attrs: { title?: string | null }) => ({
          title: attrs.title ?? 'Embedded content',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'iframe[data-vulse-embed="iframe"]' }, { tag: 'iframe[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const parsed = parseIframeCode(String(HTMLAttributes.code ?? ''));
    const src = parsed?.src ?? (HTMLAttributes.src as string | null | undefined) ?? null;
    const title =
      parsed?.title ?? (HTMLAttributes.title as string | null | undefined) ?? 'Embedded content';
    if (!src) return ['div', { 'data-vulse-embed': 'iframe' }];

    return [
      'iframe',
      mergeAttributes(
        {
          'data-vulse-embed': 'iframe',
          loading: parsed?.loading ?? 'lazy',
          allowfullscreen: parsed?.allowfullscreen ? 'true' : 'true',
          frameborder: parsed?.frameborder ?? '0',
          src,
          title,
        },
        parsed?.width ? { width: parsed.width } : {},
        parsed?.height ? { height: parsed.height } : {},
        parsed?.allow ? { allow: parsed.allow } : {},
        parsed?.referrerpolicy ? { referrerpolicy: parsed.referrerpolicy } : {},
        HTMLAttributes,
      ),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(VulseIframeNodeView);
  },

  addCommands() {
    return {
      insertVulseIframe:
        (src = '', title = 'Embedded content') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              code: src
                ? `<iframe src="${sanitizeMediaSrc(src) ?? ''}" title="${title}"></iframe>`
                : null,
              src: sanitizeMediaSrc(src),
              title,
            },
          }),
    };
  },
});
