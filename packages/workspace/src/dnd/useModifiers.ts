import {
  RestrictToHorizontalAxis,
  RestrictToVerticalAxis,
} from "@dnd-kit/abstract/modifiers";
import _ from "lodash";
import { getSectionIsHorizontalOrientation } from "../document/documentSelectors.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import { useDndState } from "./dndState.js";

export function useModifiers() {
  const host = useWorkspaceHost();
  const { isSorting, activeId } = useDndState((x) => {
    return { isSorting: x.isSorting, activeId: x.activeId };
  }, _.isEqual);

  const modifiers = getModifiers(host, isSorting, activeId);

  return { modifiers };
}

function getModifiers(
  host: ReturnType<typeof useWorkspaceHost>,
  isSorting: boolean,
  activeId: string | null,
) {
  if (isSorting && activeId) {
    const parentId =
      getWorkspaceDocumentStore(host).getState().parentSectionMap[activeId];
    if (parentId) {
      return getSectionIsHorizontalOrientation(host, parentId)
        ? [RestrictToHorizontalAxis]
        : [RestrictToVerticalAxis];
    }
  }
  return null;
}
