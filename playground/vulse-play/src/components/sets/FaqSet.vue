<script setup lang="ts">
/**
 * Example custom set renderer for BlockRenderer.vue.
 * Register as: { 'set:faq': FaqSet }
 *
 * In Admin → Settings → Sets, create a set with handle `faq`
 * and fields like `question` (text) + `answer` (textarea).
 */
defineProps<{
  data: {
    question?: string
    answer?: string
  }
}>()
</script>

<template>
  <details class="faq-set" data-vulse-set="faq">
    <summary>{{ data.question ?? 'Question' }}</summary>
    <div class="faq-set__answer">{{ data.answer ?? '' }}</div>
  </details>
</template>

<style scoped>
.faq-set {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  background: #1e222a;
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.faq-set summary {
  list-style: none;
  cursor: pointer;
  font-weight: 600;
  padding: 1rem 1.25rem;
  padding-right: 2.5rem;
  position: relative;
}

.faq-set summary::-webkit-details-marker {
  display: none;
}

.faq-set summary::after {
  content: '+';
  position: absolute;
  right: 1.25rem;
  color: #e8a838;
}

.faq-set[open] summary::after {
  content: '−';
}

.faq-set__answer {
  padding: 0 1.25rem 1.25rem;
  color: #9aa3b2;
  line-height: 1.6;
}
</style>
