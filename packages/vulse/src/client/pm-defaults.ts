import Blockquote from './blocks/Blockquote.vue';
import BulletList from './blocks/BulletList.vue';
import CodeBlock from './blocks/CodeBlock.vue';
import Emoji from './blocks/Emoji.vue';
import HardBreak from './blocks/HardBreak.vue';
import Heading from './blocks/Heading.vue';
import ListItem from './blocks/ListItem.vue';
import OrderedList from './blocks/OrderedList.vue';
import Paragraph from './blocks/Paragraph.vue';
import Text from './blocks/Text.vue';
import VulseAccordion from './blocks/VulseAccordion.vue';
import VulseAccordionGroup from './blocks/VulseAccordionGroup.vue';
import VulseCallout from './blocks/VulseCallout.vue';
import VulseIframe from './blocks/VulseIframe.vue';
import VulseImage from './blocks/VulseImage.vue';
import VulseSet from './blocks/VulseSet.vue';
import VulseVideo from './blocks/VulseVideo.vue';
import type { BlockComponentMap } from './pm-types.js';

export const defaultComponents: BlockComponentMap = {
  paragraph: Paragraph,
  heading: Heading,
  bulletList: BulletList,
  orderedList: OrderedList,
  listItem: ListItem,
  blockquote: Blockquote,
  codeBlock: CodeBlock,
  hardBreak: HardBreak,
  text: Text,
  emoji: Emoji,
  vulseAccordionGroup: VulseAccordionGroup,
  vulseCallout: VulseCallout,
  vulseAccordion: VulseAccordion,
  vulseIframe: VulseIframe,
  vulseImage: VulseImage,
  vulseVideo: VulseVideo,
  vulseSet: VulseSet,
};
