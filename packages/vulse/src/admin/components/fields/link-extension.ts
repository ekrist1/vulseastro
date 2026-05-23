import { Mark, mergeAttributes } from '@tiptap/core';
import { sanitizeLinkHref } from './url-utils.js';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vulseLink: {
      setVulseLink: (href: string) => ReturnType;
      unsetVulseLink: () => ReturnType;
    };
  }
}

export const VulseLinkExtension = Mark.create({
  name: 'link',
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          sanitizeLinkHref(element.getAttribute('href') ?? '') ?? null,
        renderHTML: (attrs: { href?: string | null }) => (attrs.href ? { href: attrs.href } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setVulseLink:
        (href: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { href }),
      unsetVulseLink:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
