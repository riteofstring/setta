import {
  registerWorkspaceClipboardAuthority,
  type WorkspaceHost,
} from "@setta/workspace";

import { copyProjectClipboard, pasteProjectClipboard } from "../api/client";
import {
  PROJECT_CLIPBOARD_PAYLOAD_VERSION_V1,
  type ProjectSnapshotV2,
} from "../api/generatedContract";
import { parseProjectClipboardPayloadV1 } from "../api/runtimeContract";
import type { MutationState } from "./pythonCanvasAppSupport";
import {
  canCopyProjectClipboardSelection,
  createClipboardRootLayoutOverrides,
  createClipboardSectionPresentationOverrides,
  createProjectClipboardCopyRequest,
  projectClipboardPastedWorkspaceRootIds,
  projectClipboardPayloadJsonValue,
} from "./workspaceClipboardAdapter";
import type {
  ProjectRootLayoutOverride,
  ProjectSectionPresentationOverride,
} from "./workspaceClipboardProjection";

type PythonCanvasWorkspaceClipboardAuthorityOptions = Readonly<{
  acceptCanonicalSnapshot: (
    snapshot: ProjectSnapshotV2,
    canonicalRootLayoutOverrides: ReadonlyMap<
      string,
      ProjectRootLayoutOverride
    >,
    canonicalSectionPresentationOverrides: ReadonlyMap<
      string,
      ProjectSectionPresentationOverride
    >,
    activeSectionIds: ReadonlyArray<string>,
  ) => void;
  currentSnapshot: () => ProjectSnapshotV2 | null;
  enqueue: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  handleCopyFailure: (error: unknown) => Promise<void>;
  handlePasteFailure: (error: unknown) => Promise<void>;
  host: WorkspaceHost;
  isActive: () => boolean;
  updateAnnouncement: (next: MutationState) => void;
}>;

export function registerPythonCanvasWorkspaceClipboardAuthority(
  options: PythonCanvasWorkspaceClipboardAuthorityOptions,
): void {
  registerWorkspaceClipboardAuthority(options.host, {
    canCopySelection: (request) =>
      canCopyProjectClipboardSelection(
        options.currentSnapshot(),
        request.rootIds,
      ),
    id: "python-canvas",
    kind: "delegated",
    payloadVersion: PROJECT_CLIPBOARD_PAYLOAD_VERSION_V1,
    prepareCopy: (request) =>
      options.enqueue(async () => {
        const current = options.currentSnapshot();
        if (!options.isActive() || current === null) {
          throw new Error("Python Canvas is no longer active.");
        }
        options.updateAnnouncement({
          description: "Preparing Python Canvas sections for copy.",
          kind: "pending",
        });
        try {
          const response = await copyProjectClipboard(
            createProjectClipboardCopyRequest(current, request.rootIds),
          );
          if (!options.isActive()) {
            throw new Error("Python Canvas is no longer active.");
          }
          options.updateAnnouncement({ kind: "idle" });
          return projectClipboardPayloadJsonValue(response.payload);
        } catch (error) {
          if (options.isActive()) {
            await options.handleCopyFailure(error);
          }
          throw error;
        }
      }),
    paste: (request) =>
      options.enqueue(async () => {
        const current = options.currentSnapshot();
        if (!options.isActive() || current === null) {
          throw new Error("Python Canvas is no longer active.");
        }
        options.updateAnnouncement({
          description: "Pasting Python Canvas sections.",
          kind: "pending",
        });
        try {
          if (request.payloadVersion !== PROJECT_CLIPBOARD_PAYLOAD_VERSION_V1) {
            throw new Error("Python Canvas clipboard payload is unsupported.");
          }
          const payload = parseProjectClipboardPayloadV1(request.payload);
          const response = await pasteProjectClipboard({
            expectedRevision: current.project.revision,
            payload,
            projectId: current.project.id,
          });
          if (!options.isActive()) {
            throw new Error("Python Canvas is no longer active.");
          }
          const canonicalRootLayoutOverrides =
            createClipboardRootLayoutOverrides(
              request,
              response.pastedRootSectionIds,
            );
          const canonicalSectionPresentationOverrides =
            createClipboardSectionPresentationOverrides(
              request,
              payload,
              response.snapshot,
              response.pastedRootSectionIds,
            );
          const rootIds = projectClipboardPastedWorkspaceRootIds(
            response.snapshot,
            response.pastedRootSectionIds,
          );
          options.acceptCanonicalSnapshot(
            response.snapshot,
            canonicalRootLayoutOverrides,
            canonicalSectionPresentationOverrides,
            rootIds,
          );
          options.updateAnnouncement({ kind: "idle" });
          return { rootIds };
        } catch (error) {
          if (options.isActive()) {
            await options.handlePasteFailure(error);
          }
          throw error;
        }
      }),
  });
}
