import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import { filterWorkspaceSectionItems } from "./itemFiltering";

type WorkspaceItemFilterContextValue = {
  clearAndFocus: () => void;
  filterActive: boolean;
  filterInputRef: RefObject<HTMLInputElement | null>;
  hasSectionStyleTheme: boolean;
  hiddenSelectedItemCount: number;
  matchingItemCount: number;
  query: string;
  setQuery: (query: string) => void;
  visibleItemIds: ReadonlySet<string>;
};

const WorkspaceItemFilterContext = createContext<WorkspaceItemFilterContextValue | null>(null);

export function WorkspaceItemFilterProvider({
  children,
  hasSectionStyleTheme = false,
  sectionId,
}: {
  children: ReactNode;
  hasSectionStyleTheme?: boolean;
  sectionId: string;
}) {
  const [query, setQuery] = useState("");
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const section = useWorkspaceDocument((state) => getSectionOrThrow(state, sectionId));
  const result = useMemo(() => filterWorkspaceSectionItems(section, query), [query, section]);
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Section ${sectionId} has no item tree to filter.`);
  }
  const hiddenSelectedItemCount = result.filterActive
    ? itemTree.selectedItemIds.filter((itemId) => !result.visibleItemIds.has(itemId)).length
    : 0;
  const clearAndFocus = useCallback(() => {
    setQuery("");
    filterInputRef.current?.focus();
  }, []);
  const value = useMemo(
    () => ({
      clearAndFocus,
      filterActive: result.filterActive,
      filterInputRef,
      hasSectionStyleTheme,
      hiddenSelectedItemCount,
      matchingItemCount: result.matchingItemIds.size,
      query,
      setQuery,
      visibleItemIds: result.visibleItemIds,
    }),
    [clearAndFocus, hasSectionStyleTheme, hiddenSelectedItemCount, query, result],
  );

  return (
    <WorkspaceItemFilterContext.Provider value={value}>
      {children}
    </WorkspaceItemFilterContext.Provider>
  );
}

export function useWorkspaceItemFilter(): WorkspaceItemFilterContextValue | null {
  return useContext(WorkspaceItemFilterContext);
}
