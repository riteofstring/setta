import type {
  ConversationSnapshot,
  OpenWorkspaceResponse,
  SideConversation,
} from "@generated/backend";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { useConversationStore } from "../../stores/conversation-store";
import {
  bindFolderResourceForConversation,
  requestEasyButtonPaneClose,
} from "./easy-button-conversation-commands";

const workspaceId = "workspace_topic";
const timestamp = "2026-07-11T20:00:00Z";

describe("Easy Button conversation commands", () => {
  afterEach(() => {
    useConversationStore.getState().reset();
    useConversationNavigatorStore.getState().resetRuntimeState();
    vi.unstubAllGlobals();
  });

  test("disposes the pane-bound side before allowing its pane to close", async () => {
    const snapshot = conversationSnapshot("conversation_close_side");
    const side = sideConversation(snapshot, "pane_close");
    side.activeTurnId = "side_turn";
    side.activeProviderTurnId = "provider_side_turn";
    snapshot.sideConversations = [side];
    const disposed = structuredClone(snapshot);
    disposed.sideConversations[0]!.activeTurnId = null;
    disposed.sideConversations[0]!.activeProviderTurnId = null;
    disposed.sideConversations[0]!.disposedAt = timestamp;
    disposed.sideConversations[0]!.status = "disposing";
    const read = vi.fn(async () => snapshot);
    const disposeSide = vi.fn(async () => disposed);
    vi.stubGlobal("window", {
      setta: {
        conversations: { disposeSide, read },
      },
    });
    const confirm = vi.fn(() => true);

    await expect(
      requestEasyButtonPaneClose({
        confirm,
        conversationId: snapshot.conversation.id,
        paneId: "pane_close",
        workspaceId,
      }),
    ).resolves.toEqual({ removePane: true });

    expect(confirm).toHaveBeenCalledWith("End the active side conversation and close this pane?");
    expect(read).toHaveBeenCalledWith({
      conversationId: snapshot.conversation.id,
      workspaceId,
    });
    expect(disposeSide).toHaveBeenCalledWith({
      parentConversationId: snapshot.conversation.id,
      parentPaneId: "pane_close",
      sideConversationId: side.id,
      workspaceId,
    });
  });

  test("cancels pane-owned speech capture after pane close is allowed", async () => {
    const snapshot = conversationSnapshot("conversation_close_voice");
    const read = vi.fn(async () => snapshot);
    const cancelActiveConversationCapture = vi.fn();
    vi.stubGlobal("window", {
      setta: {
        conversations: { read },
      },
    });

    await expect(
      requestEasyButtonPaneClose({
        confirm: () => true,
        conversationId: snapshot.conversation.id,
        paneId: "pane_close_voice",
        speechCapture: {
          cancelActiveConversationCapture,
          start: vi.fn(async () => {}),
        },
        workspaceId,
      }),
    ).resolves.toEqual({ removePane: true });

    expect(cancelActiveConversationCapture).toHaveBeenCalledWith({
      destination: {
        conversationId: snapshot.conversation.id,
        type: "conversation",
        workspaceId,
      },
      sourcePaneId: "pane_close_voice",
    });
  });

  test("keeps the pane open when active-side disposal is not confirmed", async () => {
    const snapshot = conversationSnapshot("conversation_keep_side");
    const side = sideConversation(snapshot, "pane_keep");
    side.activeTurnId = "side_turn";
    side.activeProviderTurnId = "provider_side_turn";
    snapshot.sideConversations = [side];
    const read = vi.fn(async () => snapshot);
    const disposeSide = vi.fn();
    const cancelActiveConversationCapture = vi.fn();
    vi.stubGlobal("window", {
      setta: {
        conversations: { disposeSide, read },
      },
    });

    await expect(
      requestEasyButtonPaneClose({
        confirm: () => false,
        conversationId: snapshot.conversation.id,
        paneId: side.parentPaneId,
        speechCapture: {
          cancelActiveConversationCapture,
          start: vi.fn(async () => {}),
        },
        workspaceId,
      }),
    ).resolves.toEqual({ removePane: false });

    expect(read).toHaveBeenCalledOnce();
    expect(disposeSide).not.toHaveBeenCalled();
    expect(cancelActiveConversationCapture).not.toHaveBeenCalled();
  });

  test("binds a folderless conversation to the selected folder and pane", async () => {
    const snapshot = conversationSnapshot("conversation_bind_folder");
    snapshot.conversation.workspaceId = "workspace_bound";
    const opened = openWorkspaceResponse("workspace_bound", "/tmp/setta-bound");
    const bindFolder = vi.fn(async () => snapshot);
    const hydrateSnapshot = vi.fn();
    const loadWorkspaceSession = vi.fn(async () => {});
    const openLocalFolder = vi.fn(async () => opened);
    const requestPaneFolderBinding = vi.fn(async () => {});

    await expect(
      bindFolderResourceForConversation(
        { conversationId: snapshot.conversation.id, paneId: "pane_bind_folder" },
        {
          bindFolder,
          hydrateSnapshot,
          loadWorkspaceSession,
          openLocalFolder,
          requestPaneFolderBinding,
        },
      ),
    ).resolves.toEqual({ workspaceId: "workspace_bound" });

    expect(openLocalFolder).toHaveBeenCalledOnce();
    expect(bindFolder).toHaveBeenCalledWith({
      conversationId: snapshot.conversation.id,
      workspaceId: "workspace_bound",
    });
    expect(hydrateSnapshot).toHaveBeenCalledWith(snapshot);
    expect(requestPaneFolderBinding).toHaveBeenCalledWith({
      conversationId: snapshot.conversation.id,
      paneId: "pane_bind_folder",
      rootPath: "/tmp/setta-bound",
      workspaceId: "workspace_bound",
    });
    expect(loadWorkspaceSession).toHaveBeenCalledOnce();
  });

  test("leaves folderless conversation state untouched when folder selection is cancelled", async () => {
    const bindFolder = vi.fn();
    const hydrateSnapshot = vi.fn();
    const loadWorkspaceSession = vi.fn(async () => {});
    const openLocalFolder = vi.fn(async () => null);
    const requestPaneFolderBinding = vi.fn(async () => {});

    await expect(
      bindFolderResourceForConversation(
        { conversationId: "conversation_cancel_folder", paneId: "pane_cancel_folder" },
        {
          bindFolder,
          hydrateSnapshot,
          loadWorkspaceSession,
          openLocalFolder,
          requestPaneFolderBinding,
        },
      ),
    ).resolves.toBeNull();

    expect(openLocalFolder).toHaveBeenCalledOnce();
    expect(bindFolder).not.toHaveBeenCalled();
    expect(hydrateSnapshot).not.toHaveBeenCalled();
    expect(requestPaneFolderBinding).not.toHaveBeenCalled();
    expect(loadWorkspaceSession).not.toHaveBeenCalled();
  });
});

function conversationSnapshot(conversationId: string): ConversationSnapshot {
  return {
    artifacts: { artifacts: [], hasEarlier: false },
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: timestamp,
      id: conversationId,
      lastTrajectorySequence: 1,
      status: "working",
      title: conversationId,
      topicDescriptor: `${conversationId} descriptor`,
      updatedAt: timestamp,
      workspaceId,
    },
    eventCursor: { sequence: 0, streamId: `stream_${conversationId}` },
    narration: { events: [], hasEarlier: false },
    narratorState: {
      checkpointText: "",
      checkpointThroughSequence: 0,
      conversationId,
      currentFocus: "",
      currentFocusRevision: 0,
      currentFocusSourceSequence: 0,
      degradation: null,
      lastInvocationAt: null,
      observedThroughSequence: 0,
      status: "ready",
      topicDescriptor: `${conversationId} descriptor`,
      updatedAt: timestamp,
    },
    presentationProfile: {
      conversationId,
      narratorSpeechEnabled: false,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: null,
      resolvedPaletteId: "sky",
      updatedAt: timestamp,
    },
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: { events: [], hasEarlier: false },
    turns: { hasEarlier: false, turns: [] },
  } as ConversationSnapshot;
}

function openWorkspaceResponse(id: string, rootPath: string): OpenWorkspaceResponse {
  const workspace = {
    displayName: rootPath.split("/").at(-1) ?? rootPath,
    id,
    lastOpenedAt: timestamp,
    rootPath,
  };
  return {
    session: {
      activeWorkspaces: [workspace],
      recentWorkspaces: [],
      selectedWorkspaceId: id,
      workspaceAvailabilities: [{ available: true, unavailableReason: "", workspaceId: id }],
    },
    workspace,
  };
}

function sideConversation(snapshot: ConversationSnapshot, parentPaneId: string): SideConversation {
  return {
    activeProviderTurnId: null,
    activeTurnId: null,
    disposedAt: null,
    id: `side_${parentPaneId}`,
    parentConversationId: snapshot.conversation.id,
    parentPaneId,
    status: "active",
    updatedAt: timestamp,
  } as SideConversation;
}
