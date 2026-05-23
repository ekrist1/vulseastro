import type { InjectionKey } from 'vue';
import type { BlockComponentMap } from './pm-types.js';

export const COMPONENTS_KEY: InjectionKey<BlockComponentMap> = Symbol('vulse:components');
