import {
  applySortableItemListMove,
  deriveSortableItemParentLookup,
  type SortableItemListMovePlan,
} from "@setta/workspace/core";
import {
  SortableItemLists,
  WorkspaceInteractionBoundary,
  type SectionDefinition,
  type SectionRenderProps,
} from "@setta/workspace/react";
import { useEffect, useMemo, useState } from "react";

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

function StatefulSampleNoteSection({ data, readOnly }: SectionRenderProps<PlaygroundSectionData>) {
  const note = noteData(data);
  const [draft, setDraft] = useState("");
  return (
    <WorkspaceInteractionBoundary preventExternalDrop>
      <p className="sample-section-copy">{note.body}</p>
      <label>
        <span>Renderer-local draft</span>
        <input
          data-sample-renderer-state=""
          onChange={(event) => setDraft(event.currentTarget.value)}
          readOnly={readOnly}
          value={draft}
        />
      </label>
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

function SampleGroupSection() {
  return null;
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

function filteredFieldItemIds(
  fieldList: PlaygroundFieldListData,
  query: string,
): readonly string[] | undefined {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) return undefined;
  const visible = new Set(
    Object.entries(fieldList.items)
      .filter(([, item]) => item.label.toLocaleLowerCase().includes(normalizedQuery))
      .map(([itemId]) => itemId),
  );
  for (const list of fieldList.lists) {
    const parents = deriveSortableItemParentLookup(list.tree);
    for (const itemId of list.tree.itemIds) {
      if (!visible.has(itemId)) continue;
      let parentId = parents.get(itemId);
      while (parentId !== undefined && parentId !== list.tree.rootId) {
        visible.add(parentId);
        parentId = parents.get(parentId);
      }
    }
  }
  return Object.freeze(
    fieldList.lists.flatMap((list) => list.tree.itemIds.filter((itemId) => visible.has(itemId))),
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
  const [filterQuery, setFilterQuery] = useState("");
  const visibleItemIds = useMemo(
    () => filteredFieldItemIds(fieldList, filterQuery),
    [fieldList, filterQuery],
  );
  const totalItemCount = fieldList.lists.reduce(
    (total, list) => total + list.tree.itemIds.length,
    0,
  );
  const visibleItemCount = visibleItemIds?.length ?? totalItemCount;
  useEffect(() => {
    const selectableIds = new Set(
      visibleItemIds ?? fieldList.lists.flatMap((list) => list.tree.itemIds),
    );
    setSelectedItemIds((current) => {
      const next = current.filter((itemId) => selectableIds.has(itemId));
      if (next.length === current.length) return current;
      selectionStore.set(sectionId, next);
      return next;
    });
  }, [fieldList.lists, sectionId, selectionStore, visibleItemIds]);
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
  const handleMove = (plan: SortableItemListMovePlan) => {
    const destinationList = fieldList.lists.find((list) => list.listId === plan.destinationListId);
    if (!destinationList) {
      throw new TypeError(
        `Field-list destination ${JSON.stringify(plan.destinationListId)} is unavailable.`,
      );
    }
    onDataChange(
      sectionId,
      { ...fieldList, lists: applySortableItemListMove(fieldList.lists, plan) },
      `${itemLabel(plan.itemIds[0] ?? "Item")} moved to ${destinationList.label}.`,
    );
  };
  const handleSelectionChange = (itemIds: readonly string[]) => {
    selectionStore.set(sectionId, itemIds);
    setSelectedItemIds(itemIds);
  };
  const filterId = `sample-field-filter-${sectionId}`;
  return (
    <>
      <div className="sample-field-filter">
        <label htmlFor={filterId}>Filter fields</label>
        <div className="sample-field-filter__controls">
          <input
            id={filterId}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
            placeholder="Name or email"
            type="search"
            value={filterQuery}
          />
          <button
            disabled={filterQuery.length === 0}
            onClick={() => setFilterQuery("")}
            type="button"
          >
            Clear filter
          </button>
        </div>
        <output aria-live="polite" htmlFor={filterId}>
          {visibleItemCount === 0 && filterQuery.trim().length > 0
            ? `No fields match “${filterQuery.trim()}”. Clear the filter to show all fields.`
            : `Showing ${String(visibleItemCount)} of ${String(totalItemCount)} fields.`}
        </output>
      </div>
      <SortableItemLists
        ariaLabel="Profile field lists"
        canContainChildren={(itemId) => fieldList.items[itemId]?.type === "group"}
        canMove={(plan) =>
          !(plan.destinationParentId === "preferences" && plan.itemIds.includes("notes"))
        }
        disabled={readOnly}
        getItemLabel={itemLabel}
        lists={fieldList.lists}
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
        selectedItemIds={selectedItemIds.filter(
          (itemId) => visibleItemIds === undefined || visibleItemIds.includes(itemId),
        )}
        {...(visibleItemIds ? { visibleItemIds } : {})}
      />
    </>
  );
}

export function createPlaygroundSectionDefinitions(
  onFieldListDataChange: PlaygroundFieldListDataChangeHandler,
  fieldListSelectionEpoch: number,
  proveDetachmentRendererIdentity = false,
) {
  const fieldListSelectionStore = new Map<string, readonly string[]>();
  const definitions = [
    {
      chrome: "default",
      creation: { group: "Basics", icon: "N", keywords: ["example", "note"] },
      defaultSize: { height: 220, width: 320 },
      defaultTitle: "Sample section",
      detachable: true,
      displayName: "Sample note",
      kind: "sample-note",
      render: proveDetachmentRendererIdentity ? StatefulSampleNoteSection : SampleNoteSection,
    },
    {
      chrome: "compact",
      creation: { group: "Basics", icon: "S", keywords: ["counter", "progress", "status"] },
      defaultSize: { height: 170, width: 280 },
      defaultTitle: "Workspace status",
      displayName: "Status counter",
      kind: "sample-status",
      render: SampleStatusSection,
    },
    {
      canContainSections: true,
      creation: { group: "Structure", icon: "G", keywords: ["container", "group", "nest"] },
      defaultChildOrientation: "vertical",
      defaultChildOverflow: "grow",
      defaultSize: { height: 280, width: 380 },
      defaultSizeMode: { height: "content", width: "fixed" },
      defaultTitle: "Section group",
      displayName: "Section group",
      kind: "sample-group",
      render: SampleGroupSection,
      resize: {
        axes: "both",
        maxSize: { height: 1_200, width: 720 },
        minSize: { height: 160, width: 240 },
      },
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
