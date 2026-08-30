import { screenToFlowPosition } from "../viewportPosition";
import type { WorkspaceHost } from "../../workspaceHost";
import type {
  WorkspaceExternalDropCallback,
  WorkspaceExternalDropCanDrop,
  WorkspaceExternalDropConfiguration,
} from "./types";

type WorkspaceExternalDropCallbacks = {
  canDrop: WorkspaceExternalDropCanDrop;
  onDrop: WorkspaceExternalDropCallback;
};

type WorkspaceExternalDropHandlers = {
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

export function assertWorkspaceExternalDropConfiguration(
  configuration: WorkspaceExternalDropConfiguration,
): asserts configuration is WorkspaceExternalDropConfiguration {
  if (
    configuration === null ||
    typeof configuration !== "object" ||
    Array.isArray(configuration)
  ) {
    throw new Error("Workspace external drop configuration must be an object.");
  }
  const { canDrop, onDrop } = configuration;
  if (typeof canDrop !== "function" || typeof onDrop !== "function") {
    throw new Error(
      "Workspace external drop configuration requires canDrop and onDrop callbacks.",
    );
  }
}

function isWorkspaceExternalDropPaneEvent(event: DragEvent): boolean {
  return event.target === event.currentTarget;
}

function createWorkspaceExternalDropHandlers(
  host: WorkspaceHost,
  configuration: WorkspaceExternalDropConfiguration,
): WorkspaceExternalDropHandlers {
  assertWorkspaceExternalDropConfiguration(configuration);
  const { canDrop, onDrop }: WorkspaceExternalDropCallbacks = configuration;

  return {
    onDragOver: (event) => {
      if (!isWorkspaceExternalDropPaneEvent(event)) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer || !canDrop(dataTransfer)) {
        return;
      }
      event.preventDefault();
      dataTransfer.dropEffect = "copy";
    },
    onDrop: (event) => {
      if (!isWorkspaceExternalDropPaneEvent(event)) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer || !canDrop(dataTransfer)) {
        return;
      }
      const position = screenToFlowPosition(host, {
        x: event.clientX,
        y: event.clientY,
      });
      event.preventDefault();
      onDrop(dataTransfer, position, event);
    },
  };
}

export function attachWorkspaceExternalDropHandlers(
  host: WorkspaceHost,
  pane: HTMLElement,
  configuration: WorkspaceExternalDropConfiguration,
): () => void {
  const handlers = createWorkspaceExternalDropHandlers(host, configuration);
  pane.addEventListener("dragover", handlers.onDragOver);
  pane.addEventListener("drop", handlers.onDrop);
  return () => {
    pane.removeEventListener("dragover", handlers.onDragOver);
    pane.removeEventListener("drop", handlers.onDrop);
  };
}
