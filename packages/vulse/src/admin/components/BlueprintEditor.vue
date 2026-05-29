<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { adminApi } from '../client/api.js'
import type {
  BlueprintDefinition,
  FieldDefinition,
  FieldUi,
  NestedFieldDefinition,
  NonReplicatorFieldUi,
  ReplicatorSetDefinition,
} from '../../core/blueprints/definition.js'
import { useSets } from '../composables/useSets.js'
import { useToast } from '../composables/toast.js'
import BlocksSetsPicker from './fields/BlocksSetsPicker.vue'
import { normalizeFieldHandle } from '../../core/slug.js'
import {
  defaultScaffoldRoutes,
  generateCollectionScaffoldFiles,
  generateContentConfig,
  scaffoldCliCommand,
} from '../../scaffold/collection.js'
import { formatSelectOptionsText, parseSelectOptionsText } from '../../core/blueprints/select-helpers.js'
import { defaultPreviewPath } from '../../core/blueprints/preview-path.js'
import type { SeoFieldMapping } from '../../core/blueprints/seo.js'

const props = defineProps<{ handle: string | null; isAdmin?: boolean }>()
const { sets, hydrate: hydrateSets } = useSets()
const blueprintList = ref<BlueprintDefinition[]>([])

async function refreshBlueprints() {
  blueprintList.value = await adminApi.get<BlueprintDefinition[]>('/api/vulse/blueprints')
}

interface EditorNestedField extends NestedFieldDefinition {
  previousName: string | null;
  nameTouched?: boolean;
}

interface EditorReplicatorSet extends Omit<ReplicatorSetDefinition, 'fields'> {
  fields: EditorNestedField[];
  previousName: string | null;
  nameTouched?: boolean;
}

type EditorFieldUi =
  | NonReplicatorFieldUi
  | {
      kind: 'replicator';
      sets: EditorReplicatorSet[];
    }
  | {
      kind: 'grid';
      fields: EditorNestedField[];
      minRows?: number;
      maxRows?: number;
      mode?: 'table' | 'stacked';
      addLabel?: string;
    };

interface EditorField extends Omit<FieldDefinition, 'ui'> {
  ui: EditorFieldUi;
  previousName: string | null; // null = newly added; otherwise tracks rename source
  nameTouched?: boolean;
}

type RemovalTarget =
  | {
      kind: 'field';
      index: number;
      name: string;
      requiresVerification: boolean;
    }
  | {
      kind: 'replicator-set';
      fieldIndex: number;
      setIndex: number;
      name: string;
      requiresVerification: boolean;
    }
  | {
      kind: 'replicator-nested-field';
      fieldIndex: number;
      setIndex: number;
      nestedIndex: number;
      name: string;
      requiresVerification: boolean;
    }
  | {
      kind: 'blueprint';
      name: string;
      requiresVerification: true;
    };

const handle = ref('');
const label = ref('');
const singleton = ref(false);
const tree = ref(false);
const drafts = ref(false);
const seo = ref(false);
const seoMetaTitleField = ref('');
const seoMetaDescriptionField = ref('');
const seoOgImageField = ref('');
const maxDepth = ref<number | null>(null);
const previewPath = ref('');
const previewRootSelector = ref('');
const previewLive = ref(true);
const previewPathTouched = ref(false);
const fields = reactive<EditorField[]>([]);
const expandedIndex = ref<number | null>(null);
const expandedReplicatorSets = reactive<Set<string>>(new Set());
const originalDrafts = ref(false);

const seoTitleFieldOptions = computed(() =>
  fields.filter((f) => f.ui.kind === 'text' || f.ui.kind === 'textarea'),
)
const seoDescriptionFieldOptions = computed(() =>
  fields.filter((f) => f.ui.kind === 'text' || f.ui.kind === 'textarea' || f.ui.kind === 'blocks'),
)
const seoImageFieldOptions = computed(() => fields.filter((f) => f.ui.kind === 'asset'))

function buildSeoMappingPayload(): SeoFieldMapping | undefined {
  const mapping: SeoFieldMapping = {}
  if (seoMetaTitleField.value) mapping.metaTitle = seoMetaTitleField.value
  if (seoMetaDescriptionField.value) mapping.metaDescription = seoMetaDescriptionField.value
  if (seoOgImageField.value) mapping.ogImage = seoOgImageField.value
  return Object.keys(mapping).length ? mapping : undefined
}

function setKey(fieldIndex: number, setIndex: number): string {
  return `${fieldIndex}:${setIndex}`;
}
function isSetExpanded(fieldIndex: number, setIndex: number): boolean {
  return expandedReplicatorSets.has(setKey(fieldIndex, setIndex));
}
function toggleSetExpanded(fieldIndex: number, setIndex: number) {
  const key = setKey(fieldIndex, setIndex);
  if (expandedReplicatorSets.has(key)) expandedReplicatorSets.delete(key);
  else expandedReplicatorSets.add(key);
}

const errors = reactive<Record<string, string>>({});
const submitError = ref<string | null>(null);
const saving = ref(false);
const toast = useToast();
const hydrated = ref(false);
const loadError = ref<string | null>(null);

const handleLocked = ref(false);
const removalTarget = ref<RemovalTarget | null>(null);
const removalVerification = ref('');

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '');
}

function syncHandleFromLabel(
  target: { label?: string; name: string; previousName: string | null; nameTouched?: boolean },
) {
  if (target.previousName !== null || target.nameTouched) return
  target.name = normalizeFieldHandle(target.label ?? '')
}

function onFieldLabelInput(i: number, value: string) {
  const field = fields[i]!
  field.label = value
  syncHandleFromLabel(field)
}

function onFieldHandleInput(i: number) {
  fields[i]!.nameTouched = true
}

function onReplicatorSetLabelInput(fieldIndex: number, setIndex: number, value: string) {
  const set = fields[fieldIndex]!.ui.kind === 'replicator'
    ? fields[fieldIndex]!.ui.sets[setIndex]!
    : null
  if (!set) return
  set.label = value
  syncHandleFromLabel(set)
}

function onReplicatorSetHandleInput(fieldIndex: number, setIndex: number) {
  const set = fields[fieldIndex]!.ui.kind === 'replicator'
    ? fields[fieldIndex]!.ui.sets[setIndex]!
    : null
  if (set) set.nameTouched = true
}

function onNestedFieldLabelInput(fieldIndex: number, setIndex: number, nestedIndex: number, value: string) {
  const nested = fields[fieldIndex]!.ui.kind === 'replicator'
    ? fields[fieldIndex]!.ui.sets[setIndex]!.fields[nestedIndex]!
    : null
  if (!nested) return
  nested.label = value
  syncHandleFromLabel(nested)
}

function onNestedFieldHandleInput(fieldIndex: number, setIndex: number, nestedIndex: number) {
  const nested = fields[fieldIndex]!.ui.kind === 'replicator'
    ? fields[fieldIndex]!.ui.sets[setIndex]!.fields[nestedIndex]!
    : null
  if (nested) nested.nameTouched = true
}

function unlockHandle() {
  handleLocked.value = true;
}

function resetHandle() {
  handleLocked.value = false;
  handle.value = slugify(label.value);
}

const isCreate = computed(() => props.handle === null);

const scaffoldShowRoute = ref('')
const scaffoldIndexRoute = ref('')
const scaffoldFramework = ref<'astro' | 'vue'>('astro')
const scaffoldOpen = ref(true)
const copyNotice = ref<string | null>(null)

function syncPreviewPathFromHandle() {
  if (previewPathTouched.value) return
  previewPath.value = defaultPreviewPath(handle.value || 'collection')
}

function onPreviewPathInput() {
  previewPathTouched.value = true
}

function syncScaffoldRoutes() {
  const defaults = defaultScaffoldRoutes(handle.value || 'collection')
  scaffoldShowRoute.value = defaults.showRoute
  scaffoldIndexRoute.value = defaults.indexRoute
  syncPreviewPathFromHandle()
}

const scaffoldInput = computed(() => ({
  handle: handle.value,
  label: label.value || handle.value,
  showRoute: scaffoldShowRoute.value,
  indexRoute: scaffoldIndexRoute.value,
  framework: scaffoldFramework.value,
  fields: fields
    .filter((f) => f.name.trim())
    .map((f) => {
      const descriptor: {
        name: string
        label?: string
        ui: { kind: string }
        fields?: { name: string; label?: string; ui: { kind: string } }[]
        sets?: { name: string; label?: string; fields: { name: string; label?: string; ui: { kind: string } }[] }[]
      } = { name: f.name, ...(f.label ? { label: f.label } : {}), ui: { kind: f.ui.kind } }
      if (f.ui.kind === 'grid') {
        descriptor.fields = f.ui.fields.map((n) => ({
          name: n.name,
          ...(n.label ? { label: n.label } : {}),
          ui: { kind: n.ui.kind },
        }))
      }
      if (f.ui.kind === 'replicator') {
        descriptor.sets = f.ui.sets.map((s) => ({
          name: s.name,
          ...(s.label ? { label: s.label } : {}),
          fields: s.fields.map((n) => ({
            name: n.name,
            ...(n.label ? { label: n.label } : {}),
            ui: { kind: n.ui.kind },
          })),
        }))
      }
      return descriptor
    }),
}))

const scaffoldCommand = computed(() => scaffoldCliCommand(scaffoldInput.value))
const scaffoldFiles = computed(() => generateCollectionScaffoldFiles(scaffoldInput.value, { includeContentConfig: false }))
const scaffoldContentConfigSnippet = computed(() => generateContentConfig(scaffoldInput.value))

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    copyNotice.value = `Copied ${label}`
    setTimeout(() => { copyNotice.value = null }, 2000)
  } catch {
    copyNotice.value = 'Copy failed'
  }
}

watch(label, (v) => {
  if (isCreate.value && !handleLocked.value) {
    handle.value = slugify(v);
  }
});

watch(handle, () => {
  if (isCreate.value) syncScaffoldRoutes()
});

async function load() {
  for (const k of Object.keys(errors)) delete errors[k];
  fields.splice(0, fields.length);
  if (props.handle === null) {
    handle.value = '';
    label.value = '';
    singleton.value = false;
    tree.value = false;
    drafts.value = false;
    seo.value = false;
    seoMetaTitleField.value = '';
    seoMetaDescriptionField.value = '';
    seoOgImageField.value = '';
    maxDepth.value = null;
    previewPath.value = defaultPreviewPath('');
    previewRootSelector.value = '';
    previewLive.value = true;
    previewPathTouched.value = false;
    handleLocked.value = false;
    originalDrafts.value = false;
    syncScaffoldRoutes();
    return;
  }
  const bp = await adminApi.get<BlueprintDefinition>(`/api/vulse/blueprints/${props.handle}`)
  handle.value = bp.handle;
  label.value = bp.label;
  singleton.value = bp.singleton;
  tree.value = bp.tree ?? false;
  drafts.value = bp.drafts ?? false;
  seo.value = bp.seo ?? false;
  seoMetaTitleField.value = bp.seoMapping?.metaTitle ?? '';
  seoMetaDescriptionField.value = bp.seoMapping?.metaDescription ?? '';
  seoOgImageField.value = bp.seoMapping?.ogImage ?? '';
  maxDepth.value = bp.maxDepth ?? null;
  if (bp.preview) {
    previewPath.value = bp.preview.path
    previewRootSelector.value = bp.preview.rootSelector ?? ''
    previewLive.value = bp.preview.live !== false
  } else {
    previewPath.value = defaultPreviewPath(bp.handle)
    previewRootSelector.value = ''
    previewLive.value = true
  }
  previewPathTouched.value = true;
  handleLocked.value = true;
  originalDrafts.value = drafts.value;
  for (const f of bp.fields) {
    fields.push(toEditorField(f));
  }
  syncScaffoldRoutes()
}

onMounted(async () => {
  try {
    const [, setsMap] = await Promise.all([load(), hydrateSets(), refreshBlueprints()])
    sets.value = setsMap
    hydrated.value = true
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load schema editor'
  }
})
watch(() => props.handle, load);

function addField() {
  fields.push({
    name: '',
    label: '',
    ui: { kind: 'text' },
    optional: false,
    previousName: null,
  });
  expandedIndex.value = fields.length - 1;
}

function performRemoveField(i: number) {
  fields.splice(i, 1);
  if (expandedIndex.value === i) expandedIndex.value = null;
  else if (expandedIndex.value !== null && expandedIndex.value > i) expandedIndex.value -= 1;
}

function moveUp(i: number) {
  if (i === 0) return;
  const [moved] = fields.splice(i, 1);
  fields.splice(i - 1, 0, moved!);
  if (expandedIndex.value === i) expandedIndex.value = i - 1;
}

function moveDown(i: number) {
  if (i >= fields.length - 1) return;
  const [moved] = fields.splice(i, 1);
  fields.splice(i + 1, 0, moved!);
  if (expandedIndex.value === i) expandedIndex.value = i + 1;
}

function setKind(i: number, kind: FieldUi['kind']) {
  const f = fields[i]!;
  if (kind === 'select') f.ui = { kind, options: [] };
  else if (kind === 'relationship') f.ui = { kind, to: '' };
  else if (kind === 'entry') f.ui = { kind, collections: [] };
  else if (kind === 'entries') f.ui = { kind, collections: [] };
  else if (kind === 'link') f.ui = { kind, collections: [] };
  else if (kind === 'replicator') f.ui = { kind, sets: [] };
  else if (kind === 'grid') f.ui = { kind, fields: [], mode: 'table' };
  else f.ui = { kind };
  if (kind === 'blocks' || kind === 'grid') expandedIndex.value = i;
}

function setNestedKind(
  fieldIndex: number,
  setIndex: number,
  nestedIndex: number,
  kind: NonReplicatorFieldUi['kind'],
) {
  const nested =
    fields[fieldIndex]!.ui.kind === 'replicator'
      ? fields[fieldIndex]!.ui.sets[setIndex]!.fields[nestedIndex]!
      : null;
  if (!nested) return;
  if (kind === 'select') nested.ui = { kind, options: [] };
  else if (kind === 'relationship') nested.ui = { kind, to: '' };
  else if (kind === 'entry') nested.ui = { kind, collections: [] };
  else if (kind === 'entries') nested.ui = { kind, collections: [] };
  else if (kind === 'link') nested.ui = { kind, collections: [] };
  else nested.ui = { kind };
}

function setGridNestedKind(fieldIndex: number, nestedIndex: number, kind: NonReplicatorFieldUi['kind']) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'grid') return;
  const nested = field.ui.fields[nestedIndex];
  if (!nested) return;
  if (kind === 'select') nested.ui = { kind, options: [] };
  else if (kind === 'relationship') nested.ui = { kind, to: '' };
  else if (kind === 'entry') nested.ui = { kind, collections: [] };
  else if (kind === 'entries') nested.ui = { kind, collections: [] };
  else if (kind === 'link') nested.ui = { kind, collections: [] };
  else nested.ui = { kind };
}

function updateSelectUi(
  ui: Extract<NonReplicatorFieldUi, { kind: 'select' }>,
  text: string,
): Extract<NonReplicatorFieldUi, { kind: 'select' }> {
  return {
    kind: 'select',
    options: parseSelectOptionsText(text),
    ...(ui.multiple ? { multiple: true } : {}),
    ...(ui.placeholder ? { placeholder: ui.placeholder } : {}),
    ...(ui.clearable ? { clearable: true } : {}),
  };
}

function toggleCollection(
  ui: { collections?: string[] },
  handle: string,
  checked: boolean,
) {
  const current = ui.collections ?? [];
  ui.collections = checked
    ? [...current, handle]
    : current.filter((c) => c !== handle);
}

function addGridColumn(fieldIndex: number) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'grid') return;
  field.ui.fields.push({
    name: '',
    label: '',
    ui: { kind: 'text' },
    optional: false,
    previousName: null,
  });
}

function removeGridColumn(fieldIndex: number, nestedIndex: number) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'grid') return;
  field.ui.fields.splice(nestedIndex, 1);
}

function updateBlocksSets(fieldIndex: number, handles: string[]) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'blocks') return;
  field.ui = { kind: 'blocks', ...(handles.length ? { sets: handles } : {}) };
}

function updateNestedBlocksSets(
  fieldIndex: number,
  setIndex: number,
  nestedIndex: number,
  handles: string[],
) {
  const nested =
    fields[fieldIndex]?.ui.kind === 'replicator'
      ? fields[fieldIndex]!.ui.sets[setIndex]?.fields[nestedIndex]
      : null;
  if (!nested || nested.ui.kind !== 'blocks') return;
  nested.ui = { kind: 'blocks', ...(handles.length ? { sets: handles } : {}) };
}

function blocksSetHandles(fieldIndex: number): string[] {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'blocks') return [];
  return field.ui.sets ?? [];
}

function addReplicatorSet(fieldIndex: number) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'replicator') return;
  field.ui.sets.push({
    name: '',
    label: '',
    previousName: null,
    fields: [],
  });
  // Expand the newly added set so the user can fill it in right away.
  expandedReplicatorSets.add(setKey(fieldIndex, field.ui.sets.length - 1));
}

function performRemoveReplicatorSet(fieldIndex: number, setIndex: number) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'replicator') return;
  field.ui.sets.splice(setIndex, 1);
  // Rebuild the expanded-set index since indices shift after splice.
  const remaining = Array.from(expandedReplicatorSets)
    .filter((key) => {
      const [f, s] = key.split(':').map(Number);
      return !(f === fieldIndex && s === setIndex);
    })
    .map((key) => {
      const [f, s] = key.split(':').map(Number);
      if (f === fieldIndex && s! > setIndex) return setKey(f!, s! - 1);
      return key;
    });
  expandedReplicatorSets.clear();
  for (const k of remaining) expandedReplicatorSets.add(k);
}

function addReplicatorSetField(fieldIndex: number, setIndex: number) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'replicator') return;
  field.ui.sets[setIndex]!.fields.push({
    name: '',
    label: '',
    ui: { kind: 'text' },
    optional: false,
    previousName: null,
  });
}

function performRemoveReplicatorSetField(
  fieldIndex: number,
  setIndex: number,
  nestedIndex: number,
) {
  const field = fields[fieldIndex];
  if (!field || field.ui.kind !== 'replicator') return;
  field.ui.sets[setIndex]!.fields.splice(nestedIndex, 1);
}

function openFieldRemovalDialog(index: number) {
  const field = fields[index];
  if (!field) return;
  removalTarget.value = {
    kind: 'field',
    index,
    name: field.name || field.previousName || 'field',
    requiresVerification: field.previousName !== null,
  };
  removalVerification.value = '';
}

function openReplicatorSetRemovalDialog(fieldIndex: number, setIndex: number) {
  const field = fields[fieldIndex];
  const set = field?.ui.kind === 'replicator' ? field.ui.sets[setIndex] : null;
  if (!set) return;
  removalTarget.value = {
    kind: 'replicator-set',
    fieldIndex,
    setIndex,
    name: set.name || set.previousName || 'set',
    requiresVerification: set.previousName !== null,
  };
  removalVerification.value = '';
}

function openReplicatorNestedFieldRemovalDialog(
  fieldIndex: number,
  setIndex: number,
  nestedIndex: number,
) {
  const field = fields[fieldIndex];
  const nested =
    field?.ui.kind === 'replicator' ? field.ui.sets[setIndex]?.fields[nestedIndex] : null;
  if (!nested) return;
  removalTarget.value = {
    kind: 'replicator-nested-field',
    fieldIndex,
    setIndex,
    nestedIndex,
    name: nested.name || nested.previousName || 'field',
    requiresVerification: nested.previousName !== null,
  };
  removalVerification.value = '';
}

function openBlueprintRemovalDialog() {
  if (!props.handle) return;
  removalTarget.value = {
    kind: 'blueprint',
    name: props.handle,
    requiresVerification: true,
  };
  removalVerification.value = '';
}

function closeRemovalDialog() {
  removalTarget.value = null;
  removalVerification.value = '';
}

const removalDialogTitle = computed(() => {
  if (!removalTarget.value) return '';
  switch (removalTarget.value.kind) {
    case 'field':
      return `Remove field '${removalTarget.value.name}'?`;
    case 'replicator-set':
      return `Remove set '${removalTarget.value.name}'?`;
    case 'replicator-nested-field':
      return `Remove nested field '${removalTarget.value.name}'?`;
    case 'blueprint':
      return `Delete blueprint '${removalTarget.value.name}'?`;
  }
});

const removalDialogMessage = computed(() => {
  if (!removalTarget.value) return '';
  switch (removalTarget.value.kind) {
    case 'field':
      return 'Removing a schema field can orphan existing values and make them unavailable in the editor.';
    case 'replicator-set':
      return 'Removing a replicator set can strand existing content blocks that use this set and may prevent clean future edits.';
    case 'replicator-nested-field':
      return 'Removing a nested field can hide existing values inside replicator content and later saves may drop them.';
    case 'blueprint':
      return 'Deleting a blueprint removes the schema and permanently deletes every entry in this collection.';
  }
});

const removalConfirmLabel = computed(() =>
  removalTarget.value?.kind === 'blueprint' ? 'Delete' : 'Remove',
);

const removalConfirmDisabled = computed(() => {
  if (!removalTarget.value) return true;
  if (!removalTarget.value.requiresVerification) return false;
  return removalVerification.value !== removalTarget.value.name;
});

async function confirmRemoval() {
  const target = removalTarget.value;
  if (!target || removalConfirmDisabled.value) return;
  switch (target.kind) {
    case 'field':
      performRemoveField(target.index);
      break;
    case 'replicator-set':
      performRemoveReplicatorSet(target.fieldIndex, target.setIndex);
      break;
    case 'replicator-nested-field':
      performRemoveReplicatorSetField(target.fieldIndex, target.setIndex, target.nestedIndex);
      break;
    case 'blueprint':
      await adminApi.delete(`/api/vulse/blueprints/${target.name}`)
      window.location.href = '/admin'
      break
  }
  closeRemovalDialog();
}

function toEditorField(field: FieldDefinition): EditorField {
  const base = {
    name: field.name,
    ...(field.label !== undefined ? { label: field.label } : {}),
    optional: field.optional,
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    previousName: field.name,
    nameTouched: true,
  };

  if (field.ui.kind === 'replicator') {
    return {
      ...base,
      ui: {
        kind: 'replicator',
        sets: field.ui.sets.map((set) => ({
          name: set.name,
          ...(set.label !== undefined ? { label: set.label } : {}),
          previousName: set.name,
          nameTouched: true,
          fields: set.fields.map((nested) => ({
            name: nested.name,
            ...(nested.label !== undefined ? { label: nested.label } : {}),
            ui: nested.ui,
            optional: nested.optional,
            ...(nested.default !== undefined ? { default: nested.default } : {}),
            ...(nested.validation ? { validation: nested.validation } : {}),
            previousName: nested.name,
            nameTouched: true,
          })),
        })),
      },
    };
  }

  if (field.ui.kind === 'grid') {
    return {
      ...base,
      ui: {
        kind: 'grid',
        fields: field.ui.fields.map((nested) => ({
          name: nested.name,
          ...(nested.label !== undefined ? { label: nested.label } : {}),
          ui: nested.ui,
          optional: nested.optional,
          ...(nested.default !== undefined ? { default: nested.default } : {}),
          ...(nested.validation ? { validation: nested.validation } : {}),
          previousName: nested.name,
          nameTouched: true,
        })),
        ...(field.ui.minRows !== undefined ? { minRows: field.ui.minRows } : {}),
        ...(field.ui.maxRows !== undefined ? { maxRows: field.ui.maxRows } : {}),
        ...(field.ui.mode ? { mode: field.ui.mode } : {}),
        ...(field.ui.addLabel ? { addLabel: field.ui.addLabel } : {}),
      },
    };
  }

  return {
    ...base,
    ui: field.ui,
  };
}

function stripNestedEditorField(field: EditorNestedField): NestedFieldDefinition {
  return {
    name: field.name,
    ...(field.label !== undefined ? { label: field.label } : {}),
    ui: field.ui,
    optional: field.optional,
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
  };
}

function stripEditorField(field: EditorField): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: field.name,
    label: field.label,
    optional: field.optional,
  };

  if (field.ui.kind === 'replicator') {
    out.ui = {
      kind: 'replicator',
      sets: field.ui.sets.map((set) => ({
        name: set.name,
        label: set.label,
        fields: set.fields.map(stripNestedEditorField),
      })),
    };
  } else if (field.ui.kind === 'grid') {
    out.ui = {
      kind: 'grid',
      fields: field.ui.fields.map(stripNestedEditorField),
      ...(field.ui.minRows !== undefined ? { minRows: field.ui.minRows } : {}),
      ...(field.ui.maxRows !== undefined ? { maxRows: field.ui.maxRows } : {}),
      ...(field.ui.mode ? { mode: field.ui.mode } : {}),
      ...(field.ui.addLabel ? { addLabel: field.ui.addLabel } : {}),
    };
  } else {
    out.ui = field.ui;
  }

  if (field.default !== undefined) out.default = field.default;
  if (field.validation) out.validation = field.validation;
  if (field.previousName !== null && field.previousName !== field.name) {
    out.previousName = field.previousName;
  }
  return out;
}

async function save() {
  for (const k of Object.keys(errors)) delete errors[k];
  submitError.value = null;

  // Skip draft-disable warning for now (requires entry list with draft flags)
  saving.value = true
  try {
    const seoMappingPayload = seo.value ? buildSeoMappingPayload() : undefined
    const payload = {
      handle: handle.value,
      label: label.value,
      singleton: singleton.value,
      ...(tree.value ? { tree: true } : {}),
      ...(tree.value && maxDepth.value !== null && maxDepth.value > 0 ? { maxDepth: maxDepth.value } : {}),
      ...(drafts.value ? { drafts: true } : {}),
      ...(seo.value ? { seo: true } : {}),
      ...(seoMappingPayload ? { seoMapping: seoMappingPayload } : {}),
      ...(props.isAdmin
        ? {
            preview: {
              path: previewPath.value.trim() || defaultPreviewPath(handle.value),
              ...(previewRootSelector.value.trim() ? { rootSelector: previewRootSelector.value.trim() } : {}),
              ...(previewLive.value === false ? { live: false } : {}),
            },
          }
        : {}),
      fields: fields.map(stripEditorField),
    }
    if (isCreate.value) {
      await adminApi.post('/api/vulse/blueprints', payload)
      await refreshBlueprints()
      window.location.href = `/admin/schema/${handle.value}`
      return
    }
    await adminApi.patch(`/api/vulse/blueprints/${props.handle!}`, payload)
    await refreshBlueprints()
    toast.success('Blueprint saved')
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to save'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-6" data-testid="blueprint-editor">
    <h1 class="mb-4 text-xl font-semibold">{{ isCreate ? 'New collection' : `Edit ${handle}` }}</h1>

    <div v-if="loadError" class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ loadError }}
    </div>

    <form class="max-w-3xl space-y-6" @submit.prevent="save">
      <div class="space-y-3 rounded border border-zinc-200 bg-white p-4">
        <label class="block">
          <span class="block text-sm font-medium text-zinc-700">Label</span>
          <input
            v-model="label"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            data-testid="blueprint-label"
          />
          <span v-if="errors['label']" class="mt-1 block text-xs text-red-600">{{ errors['label'] }}</span>
        </label>
        <div>
          <div class="flex items-baseline justify-between">
            <span class="block text-sm font-medium text-zinc-700">Handle</span>
            <div v-if="isCreate" class="flex gap-3 text-xs">
              <button
                v-if="!handleLocked"
                type="button"
                class="text-zinc-500 hover:text-zinc-900"
                data-testid="handle-edit"
                @click="unlockHandle"
              >
                Edit
              </button>
              <button
                v-else
                type="button"
                class="text-zinc-500 hover:text-zinc-900"
                data-testid="handle-reset"
                @click="resetHandle"
              >
                Reset
              </button>
            </div>
          </div>
          <input
            v-model="handle"
            :readonly="!isCreate || !handleLocked"
            :disabled="!isCreate"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm read-only:bg-zinc-50 disabled:bg-zinc-100"
            data-testid="blueprint-handle"
          />
          <p class="mt-1 text-xs text-zinc-500">
            <template v-if="isCreate">
              The collection's stable identifier — used in admin URLs (<code>/admin/collections/{{ handle || 'handle' }}</code>),
              API paths, and your codebase imports. Lowercase letters, numbers, <code>-</code> and <code>_</code> only.
            </template>
            <template v-else>
              Handle is locked because changing it would break admin URLs (<code>/admin/collections/{{ handle }}</code>),
              public API paths, any frontend code that references this collection by name, and routing in generated
              pages. To rename, create a new collection and migrate entries.
            </template>
          </p>
          <span v-if="errors['handle']" class="mt-1 block text-xs text-red-600">{{ errors['handle'] }}</span>
        </div>
        <label class="flex items-center gap-2">
          <input
            v-model="singleton"
            type="checkbox"
            :disabled="tree"
            class="rounded border-zinc-300"
            data-testid="blueprint-singleton"
          />
          <span class="text-sm font-medium text-zinc-700">Singleton (only one entry)</span>
        </label>
        <label class="flex items-center gap-2">
          <input
            v-model="tree"
            type="checkbox"
            :disabled="singleton"
            class="rounded border-zinc-300"
            data-testid="blueprint-tree"
          />
          <span class="text-sm font-medium text-zinc-700">
            Tree structure (entries can be nested under each other)
          </span>
        </label>
        <label class="flex items-center gap-2">
          <input
            v-model="drafts"
            type="checkbox"
            class="rounded border-zinc-300"
            data-testid="blueprint-drafts"
          />
          <span class="text-sm font-medium text-zinc-700">
            Enable drafts (Save changes without affecting the live site)
          </span>
        </label>
        <label class="flex items-center gap-2">
          <input
            v-model="seo"
            type="checkbox"
            class="rounded border-zinc-300"
            data-testid="blueprint-seo"
          />
          <span class="text-sm font-medium text-zinc-700">
            Enable SEO (meta title, description, and OG image per entry)
          </span>
        </label>
        <div v-if="seo" class="space-y-3 rounded border border-zinc-200 bg-zinc-50 p-3">
          <p class="text-xs text-zinc-600">
            Map content fields to SEO defaults. Leave blank to use inferred defaults (title field, first image, etc.).
          </p>
          <label class="block">
            <span class="block text-xs font-medium text-zinc-600">Meta title source</span>
            <select v-model="seoMetaTitleField" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Default (title field)</option>
              <option v-for="f in seoTitleFieldOptions" :key="f.name" :value="f.name">
                {{ f.label || f.name }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-zinc-600">Meta description source</span>
            <select v-model="seoMetaDescriptionField" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Inferred default</option>
              <option v-for="f in seoDescriptionFieldOptions" :key="f.name" :value="f.name">
                {{ f.label || f.name }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-zinc-600">OG image source</span>
            <select v-model="seoOgImageField" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Inferred default</option>
              <option v-for="f in seoImageFieldOptions" :key="f.name" :value="f.name">
                {{ f.label || f.name }}
              </option>
            </select>
          </label>
        </div>
        <label v-if="tree" class="block">
          <span class="block text-xs font-medium text-zinc-600">
            Max nesting depth <span class="text-zinc-400">(optional — leave blank for unlimited)</span>
          </span>
          <input
            :value="maxDepth ?? ''"
            type="number"
            min="1"
            placeholder="e.g. 4"
            class="mt-1 w-32 rounded border border-zinc-300 px-3 py-1.5 text-sm"
            data-testid="blueprint-max-depth"
            @input="
              maxDepth = ($event.target as HTMLInputElement).value === ''
                ? null
                : Math.max(1, Number(($event.target as HTMLInputElement).value))
            "
          />
        </label>
      </div>

      <div
        v-if="isAdmin"
        class="space-y-3 rounded border border-zinc-200 bg-white p-4"
        data-testid="blueprint-preview-settings"
      >
        <div>
          <h2 class="text-base font-semibold text-zinc-700">Live preview</h2>
          <p class="mt-1 text-xs text-zinc-500">
            Controls where the entry editor opens live preview and the Preview button. This does not create or change
            Astro routes — the path must already exist in your site. A mismatch shows a 404 in preview.
          </p>
        </div>
        <label class="block">
          <span class="block text-sm font-medium text-zinc-700">Preview path</span>
          <input
            v-model="previewPath"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            placeholder="/post/{slug}"
            data-testid="blueprint-preview-path"
            @input="onPreviewPathInput"
          />
          <span class="mt-1 block text-xs text-zinc-500">
            Use <code>{slug}</code> for the entry URL slug, e.g. <code>/post/{slug}</code> or <code>/{slug}</code> for
            root-level pages.
          </span>
        </label>
        <label class="block">
          <span class="block text-sm font-medium text-zinc-700">
            Morph target selector <span class="font-normal text-zinc-400">(optional)</span>
          </span>
          <input
            v-model="previewRootSelector"
            class="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            placeholder="main"
            data-testid="blueprint-preview-root-selector"
          />
          <span class="mt-1 block text-xs text-zinc-500">
            CSS selector for the element updated as you type. Defaults to <code>main</code>. Change only if your layout
            uses a different wrapper.
          </span>
        </label>
        <label class="flex items-center gap-2">
          <input
            v-model="previewLive"
            type="checkbox"
            class="rounded border-zinc-300"
            data-testid="blueprint-preview-live"
          />
          <span class="text-sm font-medium text-zinc-700">Show live preview panel in the entry editor</span>
        </label>
        <p class="text-xs text-zinc-500">
          When disabled, editors still see the Preview button for saved drafts; only the split-panel live preview is
          hidden.
        </p>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-zinc-700">Fields</h2>
          <button
            type="button"
            class="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            data-testid="add-field"
            @click="addField"
          >
            + Add field
          </button>
        </div>

        <div
          v-if="fields.length === 0"
          class="rounded border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600"
          data-testid="fields-empty-state"
        >
          <p class="font-medium text-zinc-700">No fields yet.</p>
          <p class="mt-1">
            Add at least one field to define what entries in this collection look like.
          </p>
          <button
            type="button"
            class="mt-3 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            data-testid="fields-empty-add"
            @click="addField"
          >
            + Add field
          </button>
        </div>

        <div
          v-for="(f, i) in fields"
          :key="i"
          class="rounded border border-zinc-200 bg-white"
          :data-testid="`field-card-${f.name || `new-${i}`}`"
        >
          <div class="flex items-center gap-2 px-3 py-2">
            <button type="button" class="px-2 text-zinc-400 hover:text-zinc-700" :data-testid="`field-up-${i}`" @click="moveUp(i)">↑</button>
            <button type="button" class="px-2 text-zinc-400 hover:text-zinc-700" :data-testid="`field-down-${i}`" @click="moveDown(i)">↓</button>
            <div class="flex-1">
              <button
                type="button"
                class="text-left"
                :data-testid="`field-expand-${i}`"
                @click="expandedIndex = expandedIndex === i ? null : i"
              >
                <span class="font-mono text-sm">{{ f.label || f.name || '(new field)' }}</span>
                <span class="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{{ f.ui.kind }}</span>
                <span
                  v-if="f.ui.kind === 'blocks' && blocksSetHandles(i).length > 0"
                  class="ml-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700"
                >
                  {{ blocksSetHandles(i).length }} set{{ blocksSetHandles(i).length === 1 ? '' : 's' }}
                </span>
                <span v-if="!f.optional" class="ml-1 rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">required</span>
              </button>
            </div>
            <button
              type="button"
              class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              :data-testid="`field-remove-${i}`"
              @click="openFieldRemovalDialog(i)"
            >
              Remove
            </button>
          </div>

          <div v-if="expandedIndex === i" class="space-y-3 border-t border-zinc-200 px-3 py-3">
            <label class="block">
              <span class="block text-xs font-medium text-zinc-600">Label</span>
              <input
                :value="f.label ?? ''"
                class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                :data-testid="`field-label-${i}`"
                @input="onFieldLabelInput(i, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-zinc-600">Handle</span>
              <span class="block text-xs text-zinc-500">The field's template variable.</span>
              <input
                v-model="f.name"
                class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-sm read-only:bg-zinc-50"
                :class="f.previousName === null && !f.nameTouched ? 'text-zinc-500' : 'text-zinc-800'"
                :readonly="f.previousName !== null"
                :data-testid="`field-name-${i}`"
                @input="onFieldHandleInput(i)"
              />
              <button
                v-if="f.previousName === null && f.nameTouched && f.label"
                type="button"
                class="mt-1 text-xs text-zinc-600 underline hover:text-zinc-900"
                @click="f.nameTouched = false; syncHandleFromLabel(f)"
              >
                Reset from label
              </button>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-zinc-600">Kind</span>
              <select
                class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                :value="f.ui.kind"
                :data-testid="`field-kind-${i}`"
                @change="setKind(i, ($event.target as HTMLSelectElement).value as FieldUi['kind'])"
              >
                <option value="text">text</option>
                <option value="textarea">textarea</option>
                <option value="blocks">blocks</option>
                <option value="date">date</option>
                <option value="boolean">boolean</option>
                <option value="select">select</option>
                <option value="replicator">replicator</option>
                <option value="grid">grid</option>
                <option value="relationship">relationship</option>
                <option value="entry">entry</option>
                <option value="entries">entries</option>
                <option value="link">link</option>
                <option value="asset">asset</option>
              </select>
            </label>
            <label class="flex items-center gap-2">
              <input v-model="f.optional" type="checkbox" class="rounded border-zinc-300" :data-testid="`field-optional-${i}`" />
              <span class="text-xs font-medium text-zinc-600">Optional</span>
            </label>

            <!-- text/textarea: min/max -->
            <div v-if="f.ui.kind === 'text' || f.ui.kind === 'textarea'" class="flex gap-3">
              <label class="block flex-1">
                <span class="block text-xs font-medium text-zinc-600">Min length</span>
                <input
                  type="number"
                  :value="f.validation?.min ?? ''"
                  class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                  @input="
                    (function() {
                      const v = ($event.target as HTMLInputElement).value;
                      const next: { min?: number; max?: number } = {};
                      if (v !== '') next.min = Number(v);
                      if (f.validation?.max !== undefined) next.max = f.validation.max;
                      f.validation = next;
                    })()
                  "
                />
              </label>
              <label class="block flex-1">
                <span class="block text-xs font-medium text-zinc-600">Max length</span>
                <input
                  type="number"
                  :value="f.validation?.max ?? ''"
                  class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                  @input="
                    (function() {
                      const v = ($event.target as HTMLInputElement).value;
                      const next: { min?: number; max?: number } = {};
                      if (f.validation?.min !== undefined) next.min = f.validation.min;
                      if (v !== '') next.max = Number(v);
                      f.validation = next;
                    })()
                  "
                />
              </label>
            </div>

            <!-- select: options editor -->
            <div v-if="f.ui.kind === 'select'" class="space-y-2">
              <div>
                <span class="block text-xs font-medium text-zinc-600">Options</span>
                <textarea
                  rows="3"
                  class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-xs"
                  :value="formatSelectOptionsText(f.ui.options ?? [])"
                  :data-testid="`field-options-${i}`"
                  @input="f.ui = updateSelectUi(f.ui, ($event.target as HTMLTextAreaElement).value)"
                />
                <span class="text-xs text-zinc-500">One option per line. Use <code>key: Label</code> for separate keys and labels.</span>
              </div>
              <label class="flex items-center gap-2">
                <input v-model="f.ui.multiple" type="checkbox" class="rounded border-zinc-300" />
                <span class="text-xs font-medium text-zinc-600">Allow multiple</span>
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-zinc-600">Placeholder</span>
                <input
                  v-model="f.ui.placeholder"
                  type="text"
                  class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                />
              </label>
              <label class="flex items-center gap-2">
                <input v-model="f.ui.clearable" type="checkbox" class="rounded border-zinc-300" />
                <span class="text-xs font-medium text-zinc-600">Clearable</span>
              </label>
            </div>

            <!-- relationship: target picker -->
            <label v-if="f.ui.kind === 'relationship'" class="block">
              <span class="block text-xs font-medium text-zinc-600">Target collection</span>
              <select
                class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                :value="f.ui.to ?? ''"
                :data-testid="`field-to-${i}`"
                @change="f.ui = { kind: 'relationship', to: ($event.target as HTMLSelectElement).value }"
              >
                <option value="" disabled>Choose a collection</option>
                <option v-for="bp in blueprintList" :key="bp.handle" :value="bp.handle">{{ bp.handle }}</option>
              </select>
            </label>

            <!-- entry / entries / link: collection picker -->
            <div v-if="f.ui.kind === 'entry' || f.ui.kind === 'entries' || f.ui.kind === 'link'" class="space-y-2">
              <span class="block text-xs font-medium text-zinc-600">
                {{ f.ui.kind === 'link' ? 'Entry collections (optional)' : 'Collections' }}
              </span>
              <div class="flex flex-wrap gap-3">
                <label
                  v-for="bp in blueprintList"
                  :key="bp.handle"
                  class="flex items-center gap-1 text-sm"
                >
                  <input
                    type="checkbox"
                    :checked="(f.ui.collections ?? []).includes(bp.handle)"
                    @change="toggleCollection(f.ui, bp.handle, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ bp.handle }}
                </label>
              </div>
            </div>

            <label v-if="f.ui.kind === 'entries'" class="block">
              <span class="block text-xs font-medium text-zinc-600">Max entries</span>
              <input
                v-model.number="f.ui.max"
                type="number"
                min="1"
                class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
              />
            </label>

            <!-- blocks: attach global sets from Settings → Sets -->
            <BlocksSetsPicker
              v-if="f.ui.kind === 'blocks'"
              :model-value="blocksSetHandles(i)"
              :data-testid="`blocks-sets-picker-${i}`"
              @update:model-value="updateBlocksSets(i, $event)"
            />

            <div v-if="f.ui.kind === 'replicator'" class="space-y-3">
              <div class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Set names and nested field names become locked after the blueprint is saved.
              </div>

              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-zinc-600">Sets</span>
                <button
                  type="button"
                  class="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  :data-testid="`replicator-add-set-${i}`"
                  @click="addReplicatorSet(i)"
                >
                  + Add set
                </button>
              </div>

              <div
                v-if="f.ui.sets.length === 0"
                class="rounded border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-xs text-zinc-500"
              >
                Add at least one set to define repeatable content blocks.
              </div>

              <div
                v-for="(set, setIndex) in f.ui.sets"
                :key="setIndex"
                class="rounded border border-zinc-200 bg-zinc-50"
              >
                <div class="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    class="flex flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-zinc-100"
                    :data-testid="`replicator-set-toggle-${i}-${setIndex}`"
                    :aria-expanded="isSetExpanded(i, setIndex)"
                    @click="toggleSetExpanded(i, setIndex)"
                  >
                    <svg
                      class="h-4 w-4 shrink-0 text-zinc-500 transition-transform"
                      :class="{ 'rotate-180': isSetExpanded(i, setIndex) }"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Set {{ setIndex + 1 }}
                    </span>
                    <span v-if="set.name || set.label" class="text-sm font-medium text-zinc-800">
                      {{ set.label || set.name }}
                    </span>
                    <span class="ml-1 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                      {{ set.fields.length }} field{{ set.fields.length === 1 ? '' : 's' }}
                    </span>
                    <span v-if="!isSetExpanded(i, setIndex)" class="ml-auto text-xs font-medium text-zinc-600">
                      Show fields
                    </span>
                  </button>
                  <button
                    type="button"
                    class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    @click="openReplicatorSetRemovalDialog(i, setIndex)"
                  >
                    Remove set
                  </button>
                </div>

                <div v-if="isSetExpanded(i, setIndex)" class="space-y-3 border-t border-zinc-200 p-3">
                  <div class="grid gap-3 md:grid-cols-2">
                  <label class="block">
                    <span class="block text-xs font-medium text-zinc-600">Set label</span>
                    <input
                      :value="set.label ?? ''"
                      class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                      @input="onReplicatorSetLabelInput(i, setIndex, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-zinc-600">Set handle</span>
                    <span class="block text-xs text-zinc-500">The set's template variable.</span>
                    <input
                      v-model="set.name"
                      class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-sm read-only:bg-zinc-100"
                      :readonly="set.previousName !== null"
                      @input="onReplicatorSetHandleInput(i, setIndex)"
                    />
                  </label>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-medium text-zinc-600">Set fields</span>
                    <button
                      type="button"
                      class="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      @click="addReplicatorSetField(i, setIndex)"
                    >
                      + Add set field
                    </button>
                  </div>

                  <div
                    v-if="set.fields.length === 0"
                    class="rounded border border-dashed border-zinc-300 bg-white px-3 py-4 text-xs text-zinc-500"
                  >
                    Each set needs at least one field.
                  </div>

                  <div
                    v-for="(nested, nestedIndex) in set.fields"
                    :key="nestedIndex"
                    class="space-y-3 rounded border border-zinc-200 bg-white p-3"
                  >
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="block">
                        <span class="block text-xs font-medium text-zinc-600">Field label</span>
                        <input
                          :value="nested.label ?? ''"
                          class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                          @input="onNestedFieldLabelInput(i, setIndex, nestedIndex, ($event.target as HTMLInputElement).value)"
                        />
                      </label>
                      <label class="block">
                        <span class="block text-xs font-medium text-zinc-600">Field handle</span>
                        <span class="block text-xs text-zinc-500">The field's template variable.</span>
                        <input
                          v-model="nested.name"
                          class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-sm read-only:bg-zinc-100"
                          :readonly="nested.previousName !== null"
                          @input="onNestedFieldHandleInput(i, setIndex, nestedIndex)"
                        />
                      </label>
                    </div>

                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="block">
                        <span class="block text-xs font-medium text-zinc-600">Kind</span>
                        <select
                          class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                          :value="nested.ui.kind"
                          @change="
                            setNestedKind(
                              i,
                              setIndex,
                              nestedIndex,
                              ($event.target as HTMLSelectElement).value as NonReplicatorFieldUi['kind'],
                            )
                          "
                        >
                          <option value="text">text</option>
                          <option value="textarea">textarea</option>
                          <option value="blocks">blocks</option>
                          <option value="date">date</option>
                          <option value="boolean">boolean</option>
                          <option value="select">select</option>
                          <option value="relationship">relationship</option>
                          <option value="entry">entry</option>
                          <option value="entries">entries</option>
                          <option value="link">link</option>
                          <option value="asset">asset</option>
                        </select>
                      </label>

                      <label class="flex items-center gap-2 pt-6">
                        <input v-model="nested.optional" type="checkbox" class="rounded border-zinc-300" />
                        <span class="text-xs font-medium text-zinc-600">Optional</span>
                      </label>
                    </div>

                    <div v-if="nested.ui.kind === 'text' || nested.ui.kind === 'textarea'" class="flex gap-3">
                      <label class="block flex-1">
                        <span class="block text-xs font-medium text-zinc-600">Min length</span>
                        <input
                          type="number"
                          :value="nested.validation?.min ?? ''"
                          class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                          @input="
                            (function() {
                              const v = ($event.target as HTMLInputElement).value;
                              const next: { min?: number; max?: number } = {};
                              if (v !== '') next.min = Number(v);
                              if (nested.validation?.max !== undefined) next.max = nested.validation.max;
                              nested.validation = next;
                            })()
                          "
                        />
                      </label>
                      <label class="block flex-1">
                        <span class="block text-xs font-medium text-zinc-600">Max length</span>
                        <input
                          type="number"
                          :value="nested.validation?.max ?? ''"
                          class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                          @input="
                            (function() {
                              const v = ($event.target as HTMLInputElement).value;
                              const next: { min?: number; max?: number } = {};
                              if (nested.validation?.min !== undefined) next.min = nested.validation.min;
                              if (v !== '') next.max = Number(v);
                              nested.validation = next;
                            })()
                          "
                        />
                      </label>
                    </div>

                    <div v-if="nested.ui.kind === 'select'">
                      <span class="block text-xs font-medium text-zinc-600">Options</span>
                      <textarea
                        rows="3"
                        class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-xs"
                        :value="formatSelectOptionsText(nested.ui.options ?? [])"
                        @input="
                          nested.ui = updateSelectUi(nested.ui, ($event.target as HTMLTextAreaElement).value)
                        "
                      />
                    </div>

                    <label v-if="nested.ui.kind === 'relationship'" class="block">
                      <span class="block text-xs font-medium text-zinc-600">Target collection</span>
                      <select
                        class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                        :value="nested.ui.to ?? ''"
                        @change="
                          nested.ui = {
                            kind: 'relationship',
                            to: ($event.target as HTMLSelectElement).value,
                          }
                        "
                      >
                        <option value="" disabled>Choose a collection</option>
                        <option v-for="bp in blueprintList" :key="bp.handle" :value="bp.handle">{{ bp.handle }}</option>
                      </select>
                    </label>

                    <div v-if="nested.ui.kind === 'entry' || nested.ui.kind === 'entries' || nested.ui.kind === 'link'" class="space-y-2">
                      <span class="block text-xs font-medium text-zinc-600">Collections</span>
                      <div class="flex flex-wrap gap-3">
                        <label v-for="bp in blueprintList" :key="bp.handle" class="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            :checked="(nested.ui.collections ?? []).includes(bp.handle)"
                            @change="toggleCollection(nested.ui, bp.handle, ($event.target as HTMLInputElement).checked)"
                          />
                          {{ bp.handle }}
                        </label>
                      </div>
                    </div>

                    <label v-if="nested.ui.kind === 'entries'" class="block">
                      <span class="block text-xs font-medium text-zinc-600">Max entries</span>
                      <input v-model.number="nested.ui.max" type="number" min="1" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm" />
                    </label>

                    <BlocksSetsPicker
                      v-if="nested.ui.kind === 'blocks'"
                      :model-value="nested.ui.sets ?? []"
                      @update:model-value="updateNestedBlocksSets(i, setIndex, nestedIndex, $event)"
                    />

                    <div class="flex justify-end">
                      <button
                        type="button"
                        class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        @click="openReplicatorNestedFieldRemovalDialog(i, setIndex, nestedIndex)"
                      >
                        Remove field
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div v-if="f.ui.kind === 'grid'" class="space-y-3">
              <div class="flex flex-wrap gap-3">
                <label class="block flex-1">
                  <span class="block text-xs font-medium text-zinc-600">Min rows</span>
                  <input v-model.number="f.ui.minRows" type="number" min="0" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm" />
                </label>
                <label class="block flex-1">
                  <span class="block text-xs font-medium text-zinc-600">Max rows</span>
                  <input v-model.number="f.ui.maxRows" type="number" min="1" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm" />
                </label>
                <label class="block flex-1">
                  <span class="block text-xs font-medium text-zinc-600">Layout</span>
                  <select v-model="f.ui.mode" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm">
                    <option value="table">table</option>
                    <option value="stacked">stacked</option>
                  </select>
                </label>
              </div>
              <label class="block">
                <span class="block text-xs font-medium text-zinc-600">Add row label</span>
                <input v-model="f.ui.addLabel" type="text" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm" placeholder="Add row" />
              </label>

              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-zinc-600">Columns</span>
                <button type="button" class="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50" @click="addGridColumn(i)">
                  + Add column
                </button>
              </div>

              <div v-if="f.ui.fields.length === 0" class="rounded border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-xs text-zinc-500">
                Add at least one column field.
              </div>

              <div v-for="(nested, nestedIndex) in f.ui.fields" :key="nestedIndex" class="rounded border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                <div class="grid gap-3 md:grid-cols-2">
                  <label class="block">
                    <span class="block text-xs font-medium text-zinc-600">Name</span>
                    <input v-model="nested.name" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-sm" :readonly="nested.previousName !== null" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-zinc-600">Label</span>
                    <input v-model="nested.label" class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm" />
                  </label>
                </div>
                <label class="block">
                  <span class="block text-xs font-medium text-zinc-600">Kind</span>
                  <select
                    class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    :value="nested.ui.kind"
                    @change="setGridNestedKind(i, nestedIndex, ($event.target as HTMLSelectElement).value as NonReplicatorFieldUi['kind'])"
                  >
                    <option value="text">text</option>
                    <option value="textarea">textarea</option>
                    <option value="blocks">blocks</option>
                    <option value="date">date</option>
                    <option value="boolean">boolean</option>
                    <option value="select">select</option>
                    <option value="relationship">relationship</option>
                    <option value="entry">entry</option>
                    <option value="entries">entries</option>
                    <option value="link">link</option>
                    <option value="asset">asset</option>
                  </select>
                </label>
                <div v-if="nested.ui.kind === 'select'">
                  <textarea
                    rows="2"
                    class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-xs"
                    :value="formatSelectOptionsText(nested.ui.options ?? [])"
                    @input="nested.ui = updateSelectUi(nested.ui, ($event.target as HTMLTextAreaElement).value)"
                  />
                </div>
                <label v-if="nested.ui.kind === 'relationship'" class="block">
                  <span class="block text-xs font-medium text-zinc-600">Target collection</span>
                  <select
                    class="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    :value="nested.ui.to ?? ''"
                    @change="nested.ui = { kind: 'relationship', to: ($event.target as HTMLSelectElement).value }"
                  >
                    <option value="" disabled>Choose a collection</option>
                    <option v-for="bp in blueprintList" :key="bp.handle" :value="bp.handle">{{ bp.handle }}</option>
                  </select>
                </label>
                <div v-if="nested.ui.kind === 'entry' || nested.ui.kind === 'entries' || nested.ui.kind === 'link'" class="flex flex-wrap gap-3">
                  <label v-for="bp in blueprintList" :key="bp.handle" class="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      :checked="(nested.ui.collections ?? []).includes(bp.handle)"
                      @change="toggleCollection(nested.ui, bp.handle, ($event.target as HTMLInputElement).checked)"
                    />
                    {{ bp.handle }}
                  </label>
                </div>
                <button type="button" class="text-xs text-red-600 hover:bg-red-50 rounded px-2 py-1" @click="removeGridColumn(i, nestedIndex)">
                  Remove column
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="submitError" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ submitError }}
      </div>

      <div class="flex items-center gap-2">
        <button
          type="submit"
          class="vulse-button-primary rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          :disabled="!hydrated || saving || fields.length === 0"
          :title="!hydrated || fields.length === 0 ? 'Add at least one field before saving.' : undefined"
          data-testid="blueprint-save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <a
          href="/admin"
          class="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          data-testid="blueprint-cancel"
        >
          Cancel
        </a>
        <button
          v-if="!isCreate"
          type="button"
          class="ml-auto rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          data-testid="blueprint-delete"
          @click="openBlueprintRemovalDialog"
        >
          Delete
        </button>
      </div>
    </form>

    <section v-if="!isCreate && hydrated" class="mt-10 max-w-3xl rounded-xl border border-zinc-200 bg-white p-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-sm font-semibold text-zinc-800">Scaffold frontend</h2>
          <p class="mt-1 text-xs text-zinc-500">
            Generate a code blueprint and SSR Astro index/show pages. Switch the framework to Vue to emit a generic
            <code class="font-mono text-xs">EntryRenderer</code> wrapper mounted as an island. Add <code class="font-mono text-xs">--static</code> for an optional Content Layer loader snippet.
            Run the CLI locally or copy the files below.
          </p>
        </div>
        <button
          type="button"
          class="text-xs text-zinc-500 hover:text-zinc-900"
          @click="scaffoldOpen = !scaffoldOpen"
        >
          {{ scaffoldOpen ? 'Hide' : 'Show' }}
        </button>
      </div>

      <div v-if="scaffoldOpen" class="mt-4 space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-sm">
            <span class="font-medium text-zinc-700">Show route</span>
            <input v-model="scaffoldShowRoute" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono text-xs" placeholder="/blog/{slug}" />
          </label>
          <label class="block text-sm">
            <span class="font-medium text-zinc-700">Index route</span>
            <input v-model="scaffoldIndexRoute" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono text-xs" placeholder="/blog" />
            <span class="mt-1 block text-xs text-zinc-400">Leave empty to skip the index page.</span>
          </label>
          <label class="block text-sm">
            <span class="font-medium text-zinc-700">Framework</span>
            <select v-model="scaffoldFramework" class="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-xs">
              <option value="astro">Astro</option>
              <option value="vue">Vue (island)</option>
            </select>
            <span class="mt-1 block text-xs text-zinc-400">Vue emits a generic EntryRenderer wrapper mounted as an island.</span>
          </label>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-medium uppercase tracking-wide text-zinc-500">CLI command</span>
            <button type="button" class="text-xs text-zinc-600 hover:underline" @click="copyText(scaffoldCommand, 'CLI command')">Copy</button>
          </div>
          <pre class="overflow-x-auto rounded bg-zinc-50 p-3 text-xs">{{ scaffoldCommand }}</pre>
        </div>

        <div v-for="file in scaffoldFiles" :key="file.path">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-mono text-xs text-zinc-600">{{ file.path }}</span>
            <button type="button" class="text-xs text-zinc-600 hover:underline" @click="copyText(file.content, file.path)">Copy</button>
          </div>
          <pre class="max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs">{{ file.content }}</pre>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="font-mono text-xs text-zinc-600">src/content.config.ts (optional, <code class="font-mono">--static</code>)</span>
            <button type="button" class="text-xs text-zinc-600 hover:underline" @click="copyText(scaffoldContentConfigSnippet, 'content.config.ts')">Copy</button>
          </div>
          <p class="mb-2 text-xs text-zinc-500">Merge into an existing file or use as-is if you do not have one yet.</p>
          <pre class="max-h-48 overflow-auto rounded bg-zinc-50 p-3 text-xs">{{ scaffoldContentConfigSnippet }}</pre>
        </div>

        <p v-if="copyNotice" class="text-xs text-green-700">{{ copyNotice }}</p>
      </div>
    </section>

    <div
      v-if="removalTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      data-testid="remove-confirmation-modal"
    >
      <div class="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <h2 class="text-lg font-semibold text-zinc-900">{{ removalDialogTitle }}</h2>
        <p class="mt-2 text-sm text-zinc-600">{{ removalDialogMessage }}</p>
        <p v-if="removalTarget.requiresVerification" class="mt-3 text-sm text-zinc-700">
          Type <span class="font-mono font-medium">{{ removalTarget.name }}</span> to confirm.
        </p>
        <input
          v-if="removalTarget.requiresVerification"
          v-model="removalVerification"
          type="text"
          class="mt-2 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          data-testid="remove-confirmation-input"
        />
        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            data-testid="remove-confirmation-cancel"
            @click="closeRemovalDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="removalConfirmDisabled"
            data-testid="remove-confirmation-confirm"
            @click="confirmRemoval"
          >
            {{ removalConfirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
