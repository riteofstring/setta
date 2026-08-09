export type SortableItemTree = Readonly<{
  rootId: string;
  itemIds: readonly string[];
  childrenByParent: Readonly<Record<string, readonly string[]>>;
}>;

export type SortableItemSelectionMode = "replace" | "toggle";

export type SortableItemKeyboardCommand = "indent" | "move-down" | "move-up" | "outdent";

export type SortableItemDragBlock = Readonly<{
  itemIds: readonly string[];
  selectedItemIds: readonly string[];
  sourceParentId: string;
  fallbackReason: string | null;
}>;

export type ItemMovePlan = Readonly<{
  itemIds: readonly string[];
  sourceParentId: string;
  destinationParentId: string;
  destinationIndex: number;
}>;

export type SortableItemMoveRejectionCode =
  | "cycle"
  | "destination-cannot-contain"
  | "host-policy"
  | "invalid-destination-index"
  | "unknown-destination-parent";

type SortableItemMoveResult = Readonly<{
  block: SortableItemDragBlock;
  plan: ItemMovePlan;
}>;

export type SortableItemMoveDecision =
  | (SortableItemMoveResult & Readonly<{ status: "planned" | "unchanged" }>)
  | Readonly<{
      block: SortableItemDragBlock;
      code: SortableItemMoveRejectionCode;
      reason: string;
      status: "rejected";
    }>;

export type SortableItemMoveInput = Readonly<{
  activeItemId: string;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  destinationIndex: number;
  destinationParentId: string;
  selectedItemIds: readonly string[];
  tree: SortableItemTree;
}>;

export type SortableItemKeyboardMoveInput = Readonly<{
  activeItemId: string;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  command: SortableItemKeyboardCommand;
  selectedItemIds: readonly string[];
  tree: SortableItemTree;
}>;
