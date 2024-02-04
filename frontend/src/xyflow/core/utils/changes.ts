/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Node, NodeChange } from "../types";

function applyChanges(changes: any[], elements: any[]): any[] {
  // we need this hack to handle the setNodes function of the useReactFlow hook for controlled flows
  if (changes.some((c) => c.type === "reset")) {
    return changes.filter((c) => c.type === "reset").map((c) => c.item);
  }
  const initElements: any[] = changes
    .filter((c) => c.type === "add")
    .map((c) => c.item);

  return elements.reduce((res: any[], item: any) => {
    const currentChanges = changes.filter((c) => c.id === item.id);

    if (currentChanges.length === 0) {
      res.push(item);
      return res;
    }

    const updateItem = { ...item };

    for (const currentChange of currentChanges) {
      if (currentChange) {
        switch (currentChange.type) {
          case "select": {
            updateItem.selected = currentChange.selected;
            break;
          }
          case "position": {
            if (typeof currentChange.position !== "undefined") {
              updateItem.position = currentChange.position;
            }

            if (typeof currentChange.positionAbsolute !== "undefined") {
              updateItem.positionAbsolute = currentChange.positionAbsolute;
            }

            if (typeof currentChange.dragging !== "undefined") {
              updateItem.dragging = currentChange.dragging;
            }

            break;
          }
          case "dimensions": {
            if (typeof currentChange.dimensions !== "undefined") {
              updateItem.width = currentChange.dimensions.width;
              updateItem.height = currentChange.dimensions.height;
            }

            if (typeof currentChange.updateStyle !== "undefined") {
              updateItem.style = {
                ...(updateItem.style || {}),
                ...currentChange.dimensions,
              };
            }

            break;
          }
          case "remove": {
            return res;
          }
        }
      }
    }

    res.push(updateItem);
    return res;
  }, initElements);
}

export function applyNodeChanges<NodeData = any>(
  changes: NodeChange[],
  nodes: Node<NodeData>[],
): Node<NodeData>[] {
  return applyChanges(changes, nodes) as Node<NodeData>[];
}

export const createSelectionChange = (id: string, selected: boolean) => ({
  id,
  type: "select",
  selected,
});

export function getSelectionChanges(items: any[], selectedIds: string[]) {
  return items.reduce((res, item) => {
    const willBeSelected = selectedIds.includes(item.id);

    if (!item.selected && willBeSelected) {
      item.selected = true;
      res.push(createSelectionChange(item.id, true));
    } else if (item.selected && !willBeSelected) {
      item.selected = false;
      res.push(createSelectionChange(item.id, false));
    }

    return res;
  }, []);
}
