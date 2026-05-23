<script lang="ts">
import { type PropType, defineComponent, h } from 'vue';
import type { BlockMark, BlockNode } from '../pm-types.js';
import { sanitizeLinkHref } from '../url.js';

const markTag: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  code: 'code',
  underline: 'u',
  strike: 's',
};

export default defineComponent({
  name: 'VulseText',
  props: { node: { type: Object as PropType<BlockNode>, required: true } },
  setup(props) {
    return () => {
      const marks = (props.node.marks ?? []) as BlockMark[];
      let acc: ReturnType<typeof h> | string = props.node.text ?? '';
      for (const mark of marks) {
        if (mark.type === 'link') {
          const href = sanitizeLinkHref(mark.attrs?.href);
          if (href) acc = h('a', { class: 'vulse-link', href }, acc);
        } else if (markTag[mark.type]) {
          acc = h(markTag[mark.type]!, acc);
        }
      }
      return acc;
    };
  },
});
</script>
