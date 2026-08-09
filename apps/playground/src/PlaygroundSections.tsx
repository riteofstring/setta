import { applySortableItemMove, type ItemMovePlan } from "@setta/workspace/core";
import {
  SortableItemTree,
  WorkspaceInteractionBoundary,
  type SectionDefinition,
  type SectionRenderProps,
} from "@setta/workspace/react";
import { useEffect, useState } from "react";

import type {
  PlaygroundFieldItem,
  PlaygroundFieldListData,
  PlaygroundNoteData,
  PlaygroundSectionData,
  PlaygroundStatusData,
} from "./playground-model.js";

export type PlaygroundFieldListDataChangeHandler = (
  sectionId: string,
  data: PlaygroundFieldListData,
  message: string,
) => void;

function noteData(data: PlaygroundSectionData): PlaygroundNoteData {
  if (data.type !== "note") {
    throw new TypeError("The note renderer requires note data.");
  }
  return data;
}

function statusData(data: PlaygroundSectionData): PlaygroundStatusData {
  if (data.type !== "status") {
    throw new TypeError("The status renderer requires status data.");
  }
  return data;
}

function fieldListData(data: PlaygroundSectionData): PlaygroundFieldListData {
  if (data.type !== "field-list") {
    throw new TypeError("The field-list renderer requires field-list data.");
  }
  return data;
}

function SampleNoteSection({ data }: SectionRenderProps<PlaygroundSectionData>) {
  const note = noteData(data);
  return (
    <WorkspaceInteractionBoundary preventExternalDrop>
      <p className="sample-section-copy">{note.body}</p>
    </WorkspaceInteractionBoundary>
  );
}

function SampleStatusSection({ data }: SectionRenderProps<PlaygroundSectionData>) {
  const status = statusData(data);
  return (
    <p className="sample-status">
      <strong className="sample-status__count">{status.count}</strong> <span>{status.label}</span>
    </p>
  );
}

function FieldListItem({
  item,
  itemId,
  onValueChange,
  readOnly,
}: Readonly<{
  item: PlaygroundFieldItem;
  itemId: string;
  onValueChange(itemId: string, value: string): void;
  readOnly: boolean;
}>) {
  if (item.type === "group") {
    return (
      <div className="sample-field-group">
        <strong>{item.label}</strong>
        <span>Group</span>
      </div>
    );
  }
  return (
    <label className="sample-field-row">
      <span>{item.label}</span>
      <input
        name={`sample-field-${itemId}`}
        onChange={(event) => onValueChange(itemId, event.currentTarget.value)}
        readOnly={readOnly}
        value={item.value}
      />
    </label>
  );
}

function SampleFieldListSection({
  data,
  onDataChange,
  readOnly,
  selectionStore,
  sectionId,
}: SectionRenderProps<PlaygroundSectionData> &
  Readonly<{
    onDataChange: PlaygroundFieldListDataChangeHandler;
    selectionStore: Map<string, readonly string[]>;
  }>) {
  const fieldList = fieldListData(data);
  const [selectedItemIds, setSelectedItemIds] = useState<readonly string[]>(
    () => selectionStore.get(sectionId) ?? [],
  );
  useEffect(() => {
    const existingIds = new Set(fieldList.tree.itemIds);
    setSelectedItemIds((current) => {
      const next = current.filter((itemId) => existingIds.has(itemId));
      if (next.length === current.length) return current;
      selectionStore.set(sectionId, next);
      return next;
    });
  }, [fieldList.tree.itemIds, sectionId, selectionStore]);
  const itemLabel = (itemId: string) => fieldList.items[itemId]?.label ?? itemId;
  const handleValueChange = (itemId: string, value: string) => {
    const item = fieldList.items[itemId];
    if (!item || item.type !== "field") {
      throw new TypeError(`Field-list item ${JSON.stringify(itemId)} is not editable.`);
    }
    onDataChange(
      sectionId,
      {
        ...fieldList,
        items: { ...fieldList.items, [itemId]: { ...item, value } },
      },
      `${item.label} updated.`,
    );
  };
  const handleMove = (plan: ItemMovePlan) => {
    onDataChange(
      sectionId,
      { ...fieldList, tree: applySortableItemMove(fieldList.tree, plan) },
      `${itemLabel(plan.itemIds[0] ?? "Item")} item move stored in the section payload.`,
    );
  };
  const handleSelectionChange = (itemIds: readonly string[]) => {
    selectionStore.set(sectionId, itemIds);
    setSelectedItemIds(itemIds);
  };
  return (
    <SortableItemTree
      ariaLabel="Profile field order"
      canContainChildren={(itemId) => fieldList.items[itemId]?.type === "group"}
      canMove={(plan) =>
        !(plan.destinationParentId === "preferences" && plan.itemIds.includes("notes"))
      }
      disabled={readOnly}
      getItemLabel={itemLabel}
      onMove={handleMove}
      onSelectedItemIdsChange={handleSelectionChange}
      renderItem={(itemId) => {
        const item = fieldList.items[itemId];
        if (!item) {
          throw new TypeError(`Field-list item ${JSON.stringify(itemId)} has no renderer data.`);
        }
        return (
          <FieldListItem
            item={item}
            itemId={itemId}
            onValueChange={handleValueChange}
            readOnly={readOnly}
          />
        );
      }}
      selectedItemIds={selectedItemIds}
      tree={fieldList.tree}
    />
  );
}

export function createPlaygroundSectionDefinitions(
  onFieldListDataChange: PlaygroundFieldListDataChangeHandler,
  fieldListSelectionEpoch: number,
) {
  const fieldListSelectionStore = new Map<string, readonly string[]>();
  const definitions = [
    {
      chrome: "default",
      creation: { group: "Basics", icon: "N", keywords: ["example", "note"] },
      defaultSize: { height: 320, width: 320 },
      defaultTitle: "Sample section",
      displayName: "Sample note",
      kind: "sample-note",
      render: SampleNoteSection,
    },
    {
      chrome: "compact",
      creation: { group: "Basics", icon: "S", keywords: ["counter", "progress", "status"] },
      defaultSize: { height: 200, width: 280 },
      defaultTitle: "Workspace status",
      displayName: "Status counter",
      kind: "sample-status",
      render: SampleStatusSection,
    },
    {
      chrome: "default",
      creation: {
        group: "Inputs",
        icon: "F",
        keywords: ["fields", "form", "inputs", "sortable"],
      },
      defaultSize: { height: 520, width: 440 },
      defaultTitle: "Profile fields",
      displayName: "Sortable field list",
      kind: "sample-field-list",
      render: (props: SectionRenderProps<PlaygroundSectionData>) => (
        <SampleFieldListSection
          {...props}
          key={`${props.sectionId}-${String(fieldListSelectionEpoch)}`}
          onDataChange={onFieldListDataChange}
          selectionStore={fieldListSelectionStore}
        />
      ),
      resize: {
        axes: "both",
        maxSize: { height: 760, width: 640 },
        minSize: { height: 360, width: 360 },
      },
    },
  ] satisfies readonly SectionDefinition<PlaygroundSectionData>[];
  return definitions;
}
