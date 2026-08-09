import { SortableItemTree, Workspace } from "@setta/workspace";
import {
  applySortableItemMove,
  createEmptyWorkspaceDocument,
  validateSortableItemTree,
  validateWorkspaceDocument,
  type SortableItemTree as SortableItemTreeModel,
  type WorkspaceDocument,
} from "@setta/workspace/core";
import {
  WorkspaceDetachmentProvider,
  type SectionDefinition,
  type SectionRenderProps,
  type WorkspaceExternalDropHandler,
  type WorkspaceExternalDropValidator,
  type WorkspaceGroupFactory,
  type WorkspaceSectionMoveMode,
  type WorkspaceSectionMoveValidator,
  type WorkspaceToolbarControl,
} from "@setta/workspace/react";
import "@setta/workspace/styles.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing consumer root element.");
}

type ConsumerSectionData = Readonly<{ body: string }>;

const workspaceDocument: WorkspaceDocument<ConsumerSectionData> = {
  ...createEmptyWorkspaceDocument<ConsumerSectionData>(),
  rootSections: [{ position: { x: 32, y: 32 }, sectionId: "consumer-note-1" }],
  sections: {
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

function ConsumerNote({ data, readOnly }: SectionRenderProps<ConsumerSectionData>) {
  return (
    <label>
      Consumer note body
      <input defaultValue={data.body} readOnly={readOnly} />
    </label>
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
const itemTree = {
  childrenByParent: { "consumer-group": ["consumer-child"], "consumer-items": ["consumer-group"] },
  itemIds: ["consumer-group", "consumer-child"],
  rootId: "consumer-items",
} satisfies SortableItemTreeModel;
validateSortableItemTree(itemTree);

function ConsumerSortableItems() {
  const [tree, setTree] = useState<SortableItemTreeModel>(itemTree);
  const [selectedItemIds, setSelectedItemIds] = useState<readonly string[]>([]);
  return (
    <SortableItemTree
      ariaLabel="Consumer items"
      canContainChildren={(itemId) => itemId === "consumer-group"}
      getItemLabel={(itemId) => (itemId === "consumer-group" ? "Consumer group" : "Consumer child")}
      onMove={(plan) => setTree((current) => applySortableItemMove(current, plan))}
      onSelectedItemIdsChange={setSelectedItemIds}
      renderItem={(itemId) => <span>{itemId}</span>}
      selectedItemIds={selectedItemIds}
      tree={tree}
    />
  );
}
const sectionMoveMode: WorkspaceSectionMoveMode = "sort";
const validateSectionMove: WorkspaceSectionMoveValidator = ({ plan }) =>
  plan.destinationParentId === "reserved"
    ? { allowed: false, reason: "The consumer reserves this container." }
    : { allowed: true };
const onExternalDrop: WorkspaceExternalDropHandler = () => undefined;
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
const toolbarControls = [
  {
    icon: <span>+</span>,
    id: "consumer-focus",
    label: "Focus consumer canvas",
    onPress: (controller) => void controller.setViewport({ x: 0, y: 0, zoom: 1 }),
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
          data-item-tree-root={itemTree.rootId}
          data-version={workspaceDocument.schemaVersion}
          defaultDocument={workspaceDocument}
          gestureOptions={{ maxZoom: 2, minZoom: 0.5, panOnScroll: true, zoomOnScroll: false }}
          gridOptions={{ pattern: "cross", snap: false, spacing: [24, 18], visible: true }}
          groupFactory={groupFactory}
          onExternalDrop={onExternalDrop}
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
        />
      </WorkspaceDetachmentProvider>
    </div>
  </StrictMode>,
);
