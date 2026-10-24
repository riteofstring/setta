import { useDragDropMonitor } from "@dnd-kit/react";
import {
  createDragEventHandlers,
  type DndEventHandlers,
} from "./dragEventMapping";
import { useWorkspaceHost } from "../../workspaceHostContext";

export function useDndMonitor(handlers: DndEventHandlers): void {
  const host = useWorkspaceHost();
  useDragDropMonitor(createDragEventHandlers(host, handlers));
}
