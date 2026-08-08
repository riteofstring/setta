import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";

type ManagedItem = {
  id: string;
};

type UseSelectableDraftManagerOptions<Item extends ManagedItem, Draft> = {
  items: Array<Item>;
  isCreating: boolean;
  buildDraft: (item: Item) => Draft;
  buildNewDraft: () => Draft;
};

type UseSelectableDraftManagerResult<Item extends ManagedItem, Draft> = {
  activeId: string | null;
  setActiveId: (value: string | null) => void;
  activeItem: Item | null;
  draft: Draft | null;
  setDraft: Dispatch<SetStateAction<Draft | null>>;
};

export function useSelectableDraftManager<Item extends ManagedItem, Draft>({
  items,
  isCreating,
  buildDraft,
  buildNewDraft,
}: UseSelectableDraftManagerOptions<
  Item,
  Draft
>): UseSelectableDraftManagerResult<Item, Draft> {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      setActiveId(items.length > 0 ? items[0].id : null);
      return;
    }
    const exists = items.some((item) => item.id === activeId);
    if (!exists) {
      setActiveId(items.length > 0 ? items[0].id : null);
    }
  }, [activeId, isCreating, items]);

  const activeItem = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return items.find((item) => item.id === activeId) ?? null;
  }, [activeId, items]);

  useEffect(() => {
    if (isCreating) {
      setDraft(buildNewDraft());
      return;
    }
    if (!activeItem) {
      setDraft(null);
      return;
    }
    setDraft(buildDraft(activeItem));
  }, [activeItem, buildDraft, buildNewDraft, isCreating]);

  return {
    activeId,
    setActiveId,
    activeItem,
    draft,
    setDraft,
  };
}
