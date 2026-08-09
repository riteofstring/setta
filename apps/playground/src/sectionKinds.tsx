import {
  ItemDndContext,
  registerSectionKinds,
  WorkspaceItemList,
  type ItemRowRenderContext,
  type WorkspaceItem,
  type WorkspaceSection,
} from "@setta/workspace";

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
function getItemField(item: WorkspaceItem, field: string): string | boolean | undefined {
  const data = item.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Item ${item.id} is missing its row data.`);
  }
  const value = (data as Record<string, unknown>)[field];
  if (value !== undefined && typeof value !== "string" && typeof value !== "boolean") {
    throw new Error(`Item ${item.id} has a malformed ${field} field.`);
  }
  return value;
}

function isGroupItem(item: WorkspaceItem): boolean {
  return getItemField(item, "group") === true;
}

function ItemRowContent({ context }: { context: ItemRowRenderContext }) {
  const label = getItemField(context.item, "label");
  if (isGroupItem(context.item)) {
    return <p className="text-xs font-semibold text-setta-600 dark:text-setta-300">{label}</p>;
  }
  return (
    <>
      <div className="section-key overflow-hidden">
        <p className="truncate text-xs text-setta-600 dark:text-setta-300">{label}</p>
      </div>
      <p className="section-value truncate text-xs text-setta-500 dark:text-setta-400">
        {getItemField(context.item, "value")}
      </p>
    </>
  );
}

function ItemListSectionBody({ section }: { section: WorkspaceSection }) {
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Item panel section ${section.id} is missing its item tree.`);
  }
  return (
    <div className="section-full-no-title flex min-h-0 flex-col gap-y-1 overflow-y-auto px-1">
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
// initial document load. The default size is the accepted slice's 200 x 122 outer leaf
// geometry (200 x 122 content plus the shell's 1 px border on each side).
export function registerPlaygroundSectionKinds(): void {
  registerSectionKinds({
    leaf: {
      renderContent: (section) => <LeafSectionBody section={section} />,
      defaultSize: { width: 200, height: 122 },
    },
    "item-list": {
      renderContent: (section) => <ItemListSectionBody section={section} />,
      defaultSize: { width: 280, height: 240 },
    },
  });
}
