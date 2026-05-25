<script setup lang="ts">
import BlockRenderer from '@vulsecms/core/client/BlockRenderer.vue'
import FaqSet from '../sets/FaqSet.vue'

/** Sample ProseMirror doc — same shape the admin block editor saves. */
const sampleDoc = {
  type: 'doc',
  content: [
    {
      type: 'vulseAccordion',
      attrs: { summary: 'What is Vulse?', open: true },
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Vulse is an Astro-native CMS that runs on Cloudflare D1 and R2. One deploy serves your site, admin, and API.',
          }],
        },
      ],
    },
    {
      type: 'vulseAccordion',
      attrs: { summary: 'How do I style accordions?', open: false },
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Target [data-vulse-accordion] in your CSS. The playground ships styles in src/styles/site.css — copy the block styles into your project.',
          }],
        },
      ],
    },
    {
      type: 'vulseCallout',
      attrs: { tone: 'info' },
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Built-in blocks use data-vulse-* hooks. Custom sets use a Vue component map.' }],
        },
      ],
    },
    {
      type: 'vulseSet',
      attrs: {
        set: 'faq',
        data: {
          question: 'Can I use custom FAQ sets?',
          answer: 'Yes — register FaqSet as set:faq in BlockRenderer.vue. See src/components/sets/FaqSet.vue in this repo.',
        },
      },
    },
  ],
}
</script>

<template>
  <BlockRenderer
    :blocks="sampleDoc"
    :components="{ 'set:faq': FaqSet }"
    :media-url="(id) => `/api/vulse/media/${id}/file`"
  />
</template>
