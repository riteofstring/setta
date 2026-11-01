import type { WorkspaceGraphConfiguration } from "../graph/types.js";
import { assertWorkspaceExternalDropConfiguration } from "./external-drop/handlers.js";
import type { WorkspaceExternalDropConfiguration } from "./external-drop/types.js";

export type WorkspaceCanvasConfiguration = Readonly<{
  externalDrop?: WorkspaceExternalDropConfiguration;
  graph?: WorkspaceGraphConfiguration;
}>;

export function assertWorkspaceCanvasConfiguration(
  configuration: WorkspaceCanvasConfiguration | undefined,
): void {
  if (configuration === undefined) {
    return;
  }
  if (
    configuration === null ||
    typeof configuration !== "object" ||
    Array.isArray(configuration)
  ) {
    throw new Error("Workspace canvas configuration must be an object.");
  }
  if (configuration.externalDrop !== undefined) {
    assertWorkspaceExternalDropConfiguration(configuration.externalDrop);
  }
}
