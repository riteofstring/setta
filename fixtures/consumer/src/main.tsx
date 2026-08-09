import {
  SortableItemLists,
  Workspace,
  WorkspaceOutline,
  WorkspaceViewportPresets,
} from "@setta/workspace";
import {
  applySortableItemListMove,
  createEmptyWorkspaceDocument,
  createFilteredSortableItemTree,
  createWorkspaceJsonClipboardAdapter,
  packWorkspaceRectangles,
  parseWorkspaceConnections,
  parseWorkspaceViewportPresets,
  planWorkspaceRootAutoLayout,
  serializeWorkspaceConnections,
  serializeWorkspaceViewportPresets,
  validateSortableItemLists,
  validateWorkspaceDocument,
  WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  type SortableItemList,
  type WorkspaceClipboardAdapter,
  type WorkspaceConnections,
  type WorkspaceDocument,
  type WorkspaceFreeformChildLayout,
  type WorkspaceRootAutoLayoutOptions,
} from "@setta/workspace/core";
import {
  WorkspaceDetachmentProvider,
  type SectionDefinition,
  type SectionRenderProps,
  type WorkspaceExternalDropHandler,
  type WorkspaceExternalDropValidator,
  type WorkspaceGroupFactory,
  type WorkspacePaneRegistration,
  type WorkspaceSectionMoveMode,
  type WorkspaceSectionMoveValidator,
  type WorkspaceToolbarControl,
  type WorkspaceViewportCullingOptions,
} from "@setta/workspace/react";
import "@setta/workspace/styles.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing consumer root element.");
}

type ConsumerSectionData = Readonly<{ body: string }>;

const consumerFreeformChildLayout = {
  overflow: "grow",
  positioning: "freeform",
  positions: { "consumer-note-1": { x: 32, y: 40 } },
  sectionIds: ["consumer-note-1"],
} satisfies WorkspaceFreeformChildLayout;

const workspaceDocument: WorkspaceDocument<ConsumerSectionData> = {
  ...createEmptyWorkspaceDocument<ConsumerSectionData>(),
  rootSections: [{ position: { x: 32, y: 32 }, sectionId: "consumer-group-1" }],
  sections: {
    "consumer-group-1": {
      childLayout: consumerFreeformChildLayout,
      data: { body: "Freeform container rendered from the packed consumer." },
      id: "consumer-group-1",
      isMinimized: false,
      kind: "consumer-group",
      positionAndSizeLocked: false,
      presentation: { accentColor: null, chrome: "default", tagColor: null },
      size: {
        height: { mode: "content", value: 400 },
        width: { mode: "fixed", value: 420 },
      },
      title: "Consumer freeform group",
    },
    "consumer-note-1": {
      childLayout: null,
      data: { body: "Rendered from the packed consumer." },
      id: "consumer-note-1",
      isMinimized: false,
      kind: "consumer-note",
      positionAndSizeLocked: false,
      presentation: { accentColor: null, chrome: "default", tagColor: null },
      size: {
        height: { mode: "fixed", value: 180 },
        width: { mode: "fixed", value: 300 },
      },
      title: "Consumer note 1",
    },
  },
};
validateWorkspaceDocument(workspaceDocument);

const consumerConnections = parseWorkspaceConnections(
  workspaceDocument,
  serializeWorkspaceConnections(workspaceDocument, {
    edges: [],
    ports: [
      {
        id: "consumer-output",
        label: "Consumer output",
        offset: 0.5,
        sectionId: "consumer-note-1",
        side: "right",
      },
    ],
    schemaVersion: WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  } satisfies WorkspaceConnections),
);

const consumerPackingPreview = packWorkspaceRectangles({
  gap: 16,
  origin: { x: 32, y: 32 },
  rectangles: [{ height: 400, sectionId: "consumer-group-1", width: 420 }],
});
const consumerLayoutPreview = planWorkspaceRootAutoLayout({
  gap: 16,
  rootRects: [{ height: 400, sectionId: "consumer-group-1", width: 420, x: 32, y: 32 }],
});
const consumerViewportPresets = parseWorkspaceViewportPresets(
  serializeWorkspaceViewportPresets([
    { id: "consumer-overview", name: "Consumer overview", viewport: { x: 0, y: 0, zoom: 1 } },
  ]),
);
if (
  consumerPackingPreview[0]?.x !== 32 ||
  consumerLayoutPreview.positions["consumer-group-1"]?.y !== 32
) {
  throw new Error("Packed consumer root-layout helpers returned an unexpected origin.");
}

function ConsumerNote({ data, readOnly }: SectionRenderProps<ConsumerSectionData>) {
  return (
    <label>
      Consumer note body
      <input defaultValue={data.body} readOnly={readOnly} />
    </label>
  );
}

function ConsumerArrangeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 20 20"
    >
      <rect height="5" rx="1" width="5" x="3.5" y="3.5" />
      <rect height="5" rx="1" width="5" x="11.5" y="3.5" />
      <rect height="5" rx="1" width="5" x="3.5" y="11.5" />
      <rect height="5" rx="1" width="5" x="11.5" y="11.5" />
    </svg>
  );
}

const consumerSectionDefinitions = [
  {
    creation: { group: "Consumer sections", keywords: ["note"] },
    defaultSize: { height: 180, width: 300 },
    defaultTitle: "Consumer note",
    detachable: true,
    displayName: "Consumer note",
    kind: "consumer-note",
    render: ConsumerNote,
  },
  {
    canContainSections: true,
    defaultChildOrientation: "vertical",
    defaultSize: { height: 320, width: 420 },
    defaultTitle: "Consumer group",
    displayName: "Consumer group",
    kind: "consumer-group",
    render: ConsumerNote,
  },
] satisfies readonly SectionDefinition<ConsumerSectionData>[];

let nextConsumerSectionNumber = 2;
let consumerClipboardText = "";
const consumerClipboardAdapter: WorkspaceClipboardAdapter<ConsumerSectionData> =
  createWorkspaceJsonClipboardAdapter({
    allocateSectionId: ({ kind }) => `${kind}-${String(nextConsumerSectionNumber++)}`,
    clipboard: {
      readText: async () => consumerClipboardText,
      writeText: async (value) => {
        consumerClipboardText = value;
      },
    },
    validateSectionData: ({ data }) =>
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      typeof (data as { body?: unknown }).body === "string",
  });
const itemLists = [
  {
    label: "Consumer primary items",
    listId: "consumer-primary",
    tree: {
      childrenByParent: {
        "consumer-group": ["consumer-child"],
        "consumer-primary-root": ["consumer-group"],
      },
      itemIds: ["consumer-group", "consumer-child"],
      rootId: "consumer-primary-root",
    },
  },
  {
    label: "Consumer secondary items",
    listId: "consumer-secondary",
    tree: {
      childrenByParent: { "consumer-secondary-root": [] },
      itemIds: [],
      rootId: "consumer-secondary-root",
    },
  },
] satisfies readonly SortableItemList[];
validateSortableItemLists(itemLists);
const consumerPrimaryList = itemLists.find((list) => list.listId === "consumer-primary");
if (!consumerPrimaryList) throw new Error("The consumer primary item list is required.");
const consumerVisibleItemIds = createFilteredSortableItemTree(consumerPrimaryList.tree, [
  "consumer-group",
]).itemIds;

function ConsumerSortableItems() {
  const [lists, setLists] = useState<readonly SortableItemList[]>(itemLists);
  const [selectedItemIds, setSelectedItemIds] = useState<readonly string[]>([]);
  return (
    <SortableItemLists
      ariaLabel="Consumer items"
      canContainChildren={(itemId) => itemId === "consumer-group"}
      getItemLabel={(itemId) => (itemId === "consumer-group" ? "Consumer group" : "Consumer child")}
      lists={lists}
      onMove={(plan) => setLists((current) => applySortableItemListMove(current, plan))}
      onSelectedItemIdsChange={setSelectedItemIds}
      renderItem={(itemId) => <span>{itemId}</span>}
      selectedItemIds={selectedItemIds}
      visibleItemIds={consumerVisibleItemIds}
    />
  );
}
const sectionMoveMode: WorkspaceSectionMoveMode = "sort";
const validateSectionMove: WorkspaceSectionMoveValidator = ({ plan }) =>
  plan.destination.parentId === "reserved"
    ? { allowed: false, reason: "The consumer reserves this container." }
    : { allowed: true };
const onExternalDrop: WorkspaceExternalDropHandler = ({ candidate }) => {
  const placementDescription =
    candidate.placement.type === "ordered"
      ? `index-${String(candidate.placement.index)}`
      : `position-${String(candidate.placement.position.x)}-${String(candidate.placement.position.y)}`;
  document.documentElement.dataset.consumerExternalDropPlacement = placementDescription;
};
const validateExternalDrop: WorkspaceExternalDropValidator = ({ event }) =>
  event.dataTransferTypes.includes("application/x-consumer-section")
    ? { allowed: true, label: "Import consumer section" }
    : { allowed: false, reason: "Unsupported consumer drop." };
const groupFactory: WorkspaceGroupFactory<ConsumerSectionData> = ({ sectionIds }) => {
  const sectionNumber = nextConsumerSectionNumber;
  nextConsumerSectionNumber += 1;
  return {
    data: { body: `Grouped ${String(sectionIds.length)} sections in the packed consumer.` },
    id: `consumer-group-${String(sectionNumber)}`,
    kind: "consumer-group",
    title: `Consumer group ${String(sectionNumber)}`,
  };
};
const consumerAutoLayoutOptions = { gap: 48 } satisfies WorkspaceRootAutoLayoutOptions;
const consumerViewportCullingOptions = {
  enabled: true,
  overscan: 120,
} satisfies WorkspaceViewportCullingOptions;
const toolbarControls = [
  {
    icon: <span>+</span>,
    id: "consumer-focus",
    label: "Focus consumer canvas",
    onPress: (controller) => void controller.setViewport({ x: 0, y: 0, zoom: 1 }),
    placement: "project",
  },
  {
    icon: <ConsumerArrangeIcon />,
    id: "consumer-auto-layout",
    label: "Arrange consumer sections",
    onPress: (controller) => controller.autoLayoutRootSections(consumerAutoLayoutOptions),
    placement: "project",
  },
  {
    icon: <span>U</span>,
    id: "consumer-undo",
    label: "Undo consumer change",
    onPress: (controller) => {
      if (controller.getHistoryState().canUndo) {
        controller.undo();
      }
    },
    placement: "project",
  },
] satisfies readonly WorkspaceToolbarControl[];

const consumerPanes = [
  {
    icon: <span>O</span>,
    id: "consumer-outline",
    label: "Consumer outline",
    placement: "start",
    render: (controller) => (
      <WorkspaceOutline ariaLabel="Consumer section outline" controller={controller} />
    ),
  },
  {
    icon: <span>V</span>,
    id: "consumer-saved-views",
    label: "Consumer saved views",
    placement: "end",
    render: (controller) => (
      <WorkspaceViewportPresets
        ariaLabel="Consumer saved views"
        controller={controller}
        presets={consumerViewportPresets}
      />
    ),
  },
] satisfies readonly WorkspacePaneRegistration<ConsumerSectionData>[];

createRoot(root).render(
  <StrictMode>
    <ConsumerSortableItems />
    <div style={{ height: "720px" }}>
      <WorkspaceDetachmentProvider
        renderWindowHead={() => <meta content="consumer" name="packed-consumer" />}
      >
        <Workspace<ConsumerSectionData>
          appearanceOptions={{ appearance: "light" }}
          ariaLabel="Consumer workspace"
          clipboardAdapter={consumerClipboardAdapter}
          connections={consumerConnections}
          data-item-list-count={itemLists.length}
          data-version={workspaceDocument.schemaVersion}
          defaultActivePaneId="consumer-outline"
          defaultDocument={workspaceDocument}
          gestureOptions={{ maxZoom: 2, minZoom: 0.5, panOnScroll: true, zoomOnScroll: false }}
          gridOptions={{ pattern: "cross", snap: false, spacing: [24, 18], visible: true }}
          groupFactory={groupFactory}
          onExternalDrop={onExternalDrop}
          panes={consumerPanes}
          sectionDefinitions={consumerSectionDefinitions}
          sectionFactory={({ kind }) => {
            const definition = consumerSectionDefinitions.find(
              (candidate) => candidate.kind === kind,
            );
            if (!definition) {
              throw new Error(`Unknown consumer section kind ${JSON.stringify(kind)}.`);
            }
            const sectionNumber = nextConsumerSectionNumber;
            nextConsumerSectionNumber += 1;
            return {
              data: { body: "Created from the packed consumer." },
              id: `${kind}-${String(sectionNumber)}`,
              title: `${definition.defaultTitle} ${String(sectionNumber)}`,
            };
          }}
          sectionMoveMode={sectionMoveMode}
          toolbarControls={toolbarControls}
          validateExternalDrop={validateExternalDrop}
          validateSectionMove={validateSectionMove}
          viewportCullingOptions={consumerViewportCullingOptions}
        />
      </WorkspaceDetachmentProvider>
    </div>
  </StrictMode>,
);
