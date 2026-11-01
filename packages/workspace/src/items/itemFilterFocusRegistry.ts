import type { WorkspaceHost } from "../workspaceHost.js";

export const FOCUS_ITEM_FILTER_BINDING_ID = "workspace.focus-item-filter";

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

export function focusSectionItemFilter(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return getTargetsBySection(host).get(sectionId)?.() ?? false;
}
