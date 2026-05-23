import StarterKit from '@tiptap/starter-kit';
import { EmojiExtension } from './emoji-extension.js';
import { VulseAccordionGroupExtension } from './vulse-accordion-group-extension.js';
import { VulseAccordionExtension } from './vulse-accordion-extension.js';
import { VulseCalloutExtension } from './vulse-callout-extension.js';
import { VulseIframeExtension } from './vulse-iframe-extension.js';
import { VulseLinkExtension } from './link-extension.js';
import { VulseVideoExtension } from './vulse-video-extension.js';
import { VulseSetExtension } from './vulse-set-extension.js';

export const EMPTY_BLOCKS_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
} as const;

export const blocksEditorExtensions = [
  StarterKit,
  VulseLinkExtension,
  EmojiExtension,
  VulseCalloutExtension,
  VulseAccordionGroupExtension,
  VulseAccordionExtension,
  VulseIframeExtension,
  VulseVideoExtension,
  VulseSetExtension,
];
