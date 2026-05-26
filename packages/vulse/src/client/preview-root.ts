/**
 * Resolve the element the live-preview bridge should morph. Uses the configured
 * selector (default `<main>`, overridable via `data-vulse-preview-root`) and falls
 * back to `<body>` when that selector matches nothing — fresh and scaffolded pages
 * frequently have no `<main>`, and without a fallback morphdom would no-op, so live
 * edits would only appear after a full reload.
 *
 * Kept in its own dependency-free module (no `window`/`document` access at import
 * time) so it is unit-testable in Node without a DOM environment.
 */
export function resolvePreviewRoot(
  scope: { querySelector(selectors: string): Element | null; body: Element | null },
  selector: string,
): Element | null {
  return scope.querySelector(selector) ?? scope.body
}
