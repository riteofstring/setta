import {
  ItemDndContext,
  registerSectionKinds,
  setItemData,
  TextValueEditor,
  WorkspaceItemList,
  type ItemRowRenderContext,
  type WorkspaceItem,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";
import { useEffect, useRef } from "react";

// The host side of the registration seam: the package owns the shell, chrome, header, and
// resize treatment; the playground registers its one leaf kind and renders the section body
// from the kind's opaque data. No icon is registered, so headers keep the reference's
// gg-menu fallback glyph from the accepted side-by-side.

function getLeafBody(section: WorkspaceSection): string {
  const data = section.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Leaf section ${section.id} is missing its body data.`);
  }
  const body = data["body"];
  if (typeof body !== "string") {
    throw new Error(`Leaf section ${section.id} is missing its body text.`);
  }
  return body;
}

function LeafSectionBody({ section }: { section: WorkspaceSection }) {
  return (
    <div className="section-full-no-title px-1">
      <p className="text-xs text-setta-500 dark:text-setta-400">{getLeafBody(section)}</p>
    </div>
  );
}

// The host side of the registered item surface: the item panel kind mounts the package's
// per-section item drag context and one item list, names the list, supplies list membership
// from the canonical tree, and renders row content from this host's opaque item data. The
// group flag in that data drives the parent-row layout, so an emptied group keeps its chrome.
// The package owns the list-area shell (the named nested grid, scrolling, and row rhythm);
// the host only places the area in the section grid and gives it a column to fill.
function getItemDataRecord(item: WorkspaceItem): { [key: string]: WorkspaceSectionData } {
  const data = item.data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Item ${item.id} is missing its row data.`);
  }
  return data;
}

function getItemField(item: WorkspaceItem, field: string): string | boolean | undefined {
  const value = getItemDataRecord(item)[field];
  if (value !== undefined && typeof value !== "string" && typeof value !== "boolean") {
    throw new Error(`Item ${item.id} has a malformed ${field} field.`);
  }
  return value;
}

function getItemValue(item: WorkspaceItem): string {
  const value = getItemField(item, "value");
  if (typeof value !== "string") {
    throw new Error(`Item ${item.id} is missing its string value.`);
  }
  return value;
}

function isGroupItem(item: WorkspaceItem): boolean {
  return getItemField(item, "group") === true;
}

// The host-owned presentation contract, the domain-neutral equivalent of the frozen
// `/settings` Dict's label and value roles. Labels carry the reference `ParamTextLabel`
// treatment verbatim (12/16 px semibold sans-serif in setta-800/200 with the reference's
// 0.125 rem vertical padding); its click-to-focus affordance stays application-side with the
// input it focuses. Values mount the package's built-in text value editor from the
// item-controls milestone: the idle Lezer-highlighted dummy at the accepted Phase 4 metrics,
// the live CodeMirror swap, and the value-column divider with its focus treatment all live in
// the control. The playground declares the reference settings surface's language (python, the
// generated `configLanguage` default) and owns persistence: each reported change commits back
// into this host's opaque item data through the `setItemData` funnel, with no validation —
// the reference's debounced transport and backend paths have no playground equivalent.
const ITEM_LABEL_CLASS_NAME =
  "truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200";
const ITEM_VALUE_LANGUAGE = "python";

function commitItemValue(context: ItemRowRenderContext, nextValue: string) {
  setItemData(context.sectionId, context.item.id, {
    ...getItemDataRecord(context.item),
    value: nextValue,
  });
}

function ItemRowContent({ context }: { context: ItemRowRenderContext }) {
  const label = getItemField(context.item, "label");
  if (isGroupItem(context.item)) {
    // Group labels stay direct <p> children: the package row places them across the
    // key..value tracks through its compiled `[&>p]:section-key-value` rule.
    return <p className={ITEM_LABEL_CLASS_NAME}>{label}</p>;
  }
  return (
    <>
      <div className="section-key overflow-hidden">
        <p className={ITEM_LABEL_CLASS_NAME}>{label}</p>
      </div>
      <TextValueEditor
        sectionId={context.sectionId}
        itemId={context.item.id}
        value={getItemValue(context.item)}
        language={ITEM_VALUE_LANGUAGE}
        onValueChange={(nextValue) => commitItemValue(context, nextValue)}
      />
    </>
  );
}

// The reference derives its default label/value split from half the available list width:
// `useParamColumnWidth` halves the args area's clientWidth and applies it minus the 18 px
// center offset as `--param-column-width`. The playground supplies the same default through
// the package's existing host variable and re-derives it when the area resizes; the
// column-resize drag that persists an authored width stays application-side.
const COLUMN_CENTER_OFFSET_PX = 18;

function useDefaultColumnSplit() {
  const listAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listArea = listAreaRef.current;
    if (!listArea) {
      throw new Error("The item list area did not mount.");
    }
    const applyDefaultSplit = () => {
      listArea.style.setProperty(
        "--param-column-width",
        `${listArea.clientWidth / 2 - COLUMN_CENTER_OFFSET_PX}px`,
      );
    };
    applyDefaultSplit();
    const observer = new ResizeObserver(applyDefaultSplit);
    observer.observe(listArea);
    return () => observer.disconnect();
  }, []);
  return listAreaRef;
}

// Exported for the focused host-presentation regression; the application mounts it only
// through the registered section kind.
export function ItemListSectionBody({ section }: { section: WorkspaceSection }) {
  const listAreaRef = useDefaultColumnSplit();
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Item panel section ${section.id} is missing its item tree.`);
  }
  return (
    <div ref={listAreaRef} className="section-full-no-title flex min-h-0 flex-col">
      <ItemDndContext>
        <WorkspaceItemList
          sectionId={section.id}
          listKey="main"
          topLevelItemIds={itemTree.items[itemTree.rootId]?.children ?? []}
          renderItem={(context) => <ItemRowContent context={context} />}
          isGroupItem={isGroupItem}
        />
      </ItemDndContext>
    </div>
  );
}

// Loading validates every non-group kind against the registry, so registration precedes the
// initial document load. Registered sizes describe the inner section surface; the shell adds
// a 1 px border on every side. The leaf's 200 x 122 renders the accepted 202 x 124 outer
// geometry, and the item panel's 550 x 350 renders the recorded 552 x 352 `/settings` Dict
// outer measurement from the Phase 4 gate.
export function registerPlaygroundSectionKinds(): void {
  registerSectionKinds({
    leaf: {
      renderContent: (section) => <LeafSectionBody section={section} />,
      defaultSize: { width: 200, height: 122 },
    },
    "item-list": {
      renderContent: (section) => <ItemListSectionBody section={section} />,
      defaultSize: { width: 550, height: 350 },
    },
  });
}
