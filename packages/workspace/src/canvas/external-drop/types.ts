import type { Position } from "../../document/types.js";

export type WorkspaceExternalDropCanDrop = (
  dataTransfer: DataTransfer,
) => boolean;

export type WorkspaceExternalDropCallback = (
  dataTransfer: DataTransfer,
  position: Position,
  event: DragEvent,
) => void;

export type WorkspaceExternalDropConfiguration = Readonly<{
  canDrop: WorkspaceExternalDropCanDrop;
  onDrop: WorkspaceExternalDropCallback;
}>;
