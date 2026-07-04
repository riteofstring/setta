import type { PaneRenderItem } from "./types";

export interface DropPreviewBinding {
  host: HTMLElement;
}

export function syncDropPreviewOverlay<TBinding extends DropPreviewBinding>({
  assignedItems,
  bindings,
  isActivePaneDragSource,
  overlay,
}: {
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>;
  bindings: readonly TBinding[];
  isActivePaneDragSource: (binding: TBinding) => boolean;
  overlay: HTMLElement | null;
}): void {
  if (!overlay) {
    return;
  }
  const item = dropPreviewItem({ assignedItems, bindings, isActivePaneDragSource });
  if (!item) {
    if (overlay.dataset.visible !== "false") {
      overlay.dataset.visible = "false";
    }
    return;
  }
  const transform = `translate3d(${item.x.toFixed(2)}px, ${item.y.toFixed(2)}px, 0) scale(${item.scale.toFixed(3)})`;
  if (overlay.style.transform !== transform) {
    overlay.style.transform = transform;
  }
  const width = `${item.width.toFixed(2)}px`;
  if (overlay.style.width !== width) {
    overlay.style.width = width;
  }
  const height = `${item.height.toFixed(2)}px`;
  if (overlay.style.height !== height) {
    overlay.style.height = height;
  }
  if (overlay.dataset.visible !== "true") {
    overlay.dataset.visible = "true";
  }
}

// The drop-preview box marks where the dragged pane will land. For an insert it
// sits at the dragged pane's previewed slot; for a swap it sits on the pane it
// will swap with. Return nothing until the drop target is meaningful.
function dropPreviewItem<TBinding extends DropPreviewBinding>({
  assignedItems,
  bindings,
  isActivePaneDragSource,
}: {
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>;
  bindings: readonly TBinding[];
  isActivePaneDragSource: (binding: TBinding) => boolean;
}): PaneRenderItem | undefined {
  let dragSourceItem: PaneRenderItem | undefined;
  let hasInsertTarget = false;
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    if (!binding) {
      continue;
    }
    if (binding.host.dataset.dropSwap === "true") {
      return assignedItems[index];
    }
    if (binding.host.dataset.dropTarget || binding.host.dataset.dropPreview === "true") {
      hasInsertTarget = true;
    }
    if (isActivePaneDragSource(binding)) {
      dragSourceItem = assignedItems[index];
    }
  }
  return hasInsertTarget ? dragSourceItem : undefined;
}
