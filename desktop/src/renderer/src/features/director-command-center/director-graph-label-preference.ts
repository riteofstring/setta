/**
 * Whether the graph draws its DOM labels. A renderer preference like the mute
 * toggle: it changes what this window shows, not what the backend records, so
 * it lives in the renderer's own storage.
 */

const graphLabelStorageKey = "setta.graph-labels.hidden";

type LabelPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readGraphLabelsVisible(storage: LabelPreferenceStorage): boolean {
  return storage.getItem(graphLabelStorageKey) !== "true";
}

export function writeGraphLabelsVisible(storage: LabelPreferenceStorage, visible: boolean): void {
  storage.setItem(graphLabelStorageKey, visible ? "false" : "true");
}
