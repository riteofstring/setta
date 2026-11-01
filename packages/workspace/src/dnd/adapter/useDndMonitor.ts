import { useDragDropMonitor } from "@dnd-kit/react";
import {
  createDragEventHandlers,
  type DndEventHandlers,
} from "./dragEventMapping.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";

export function useDndMonitor(handlers: DndEventHandlers): void {
  const host = useWorkspaceHost();
  useDragDropMonitor(createDragEventHandlers(host, handlers));
}
