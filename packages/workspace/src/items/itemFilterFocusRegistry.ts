import type { WorkspaceHost } from "../workspaceHost";

// The one workspace operation that focuses a section's parameter filter. Both halves of the seam
// name it here: the built-in binding that runs it, and the filter control that displays whichever
// chord the operation currently answers to.
export const FOCUS_ITEM_FILTER_BINDING_ID = "workspace.focus-item-filter";

// The filter's focus seam. The reference's `focusOnSearch` rebuilds a generated element id
// (`document.getElementById(`${sectionId}-args-filter`)`); the package resolves the mounted filter
// the same way it resolves item list views — the filter owner publishes its focus target here
// while it is mounted, keyed by host and section, so the dispatcher never searches consumer DOM.
//
// The reference falls back to its application header's project search whenever the active
// selection is not exactly one section. The package has no such surface, so the operation declines
// instead and the chord stays the browser's.
type ItemFilterFocusTarget = () => boolean;

const targetsByHost = new WeakMap<
  WorkspaceHost,
  Map<string, ItemFilterFocusTarget>
>();

function getTargetsBySection(
  host: WorkspaceHost,
): Map<string, ItemFilterFocusTarget> {
  const existing = targetsByHost.get(host);
  if (existing) {
    return existing;
  }
  const targets = new Map<string, ItemFilterFocusTarget>();
  targetsByHost.set(host, targets);
  return targets;
}

// One section has one filter owner. A second registration would silently decide which filter the
// chord reaches, so it fails instead.
export function registerItemFilterFocusTarget(
  host: WorkspaceHost,
  sectionId: string,
  focus: ItemFilterFocusTarget,
): void {
  const targets = getTargetsBySection(host);
  if (targets.has(sectionId)) {
    throw new Error(
      `section "${sectionId}" already registered an item filter focus target`,
    );
  }
  targets.set(sectionId, focus);
}

// Withdrawing is identity-scoped, so an owner that unmounts after its replacement registered
// cannot take the live target down with it.
export function unregisterItemFilterFocusTarget(
  host: WorkspaceHost,
  sectionId: string,
  focus: ItemFilterFocusTarget,
): void {
  const targets = getTargetsBySection(host);
  if (targets.get(sectionId) === focus) {
    targets.delete(sectionId);
  }
}

// Focuses the section's mounted filter and reports whether it took the keypress. A section whose
// declared item area renders no filter has nothing to focus, so the operation declines.
export function focusSectionItemFilter(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return getTargetsBySection(host).get(sectionId)?.() ?? false;
}
