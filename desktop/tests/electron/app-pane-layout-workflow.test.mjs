#!/usr/bin/env node
/* global console */

import { realpath } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  createElectronFixture,
  launchElectronCdpContext,
  openFixtureWorkspace,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertMasterRouteDecision,
  waitForMasterRouteDecision,
} from "./topic-conversation-master-overlay-assertions.mjs";
import { assertDriverAction, conversationSurfaces } from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "app-pane-layout";
const workflowTimeoutMs = 20_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/app-pane-layout-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceRoot = await realpath(fixture.workspaceRoot);
  const folderlessMasterAnswer = await exerciseFolderlessMasterAnswer({
    backend,
    client: context.client,
  });
  const opened = await backend.post("/workspaces/open", { rootPath: workspaceRoot });
  const conversationId = await createFixtureConversation(
    backend,
    opened.workspace.id,
    "Workflow topic",
  );
  const result = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutRoundTrip", { conversationId, workspaceRoot }),
    (state) => state.status === "passed" || state.status === "failed",
    workflowTimeoutMs,
  );
  if (result.status !== "passed") {
    throw new Error(`app pane layout workflow failed: ${JSON.stringify(result)}`);
  }
  const workspaceId = await ensureWorkspaceOpen(context.client);
  await context.client.evaluate(
    `window.setta.appLayout.savePaneLayout(${JSON.stringify(shellAppPaneLayout(workspaceRoot, conversationId))})`,
  );
  await context.client.call("Page.reload", { ignoreCache: true });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  await context.client.installDriver();
  const restoredShell = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => shellLayoutRestored(state, workspaceId),
    workflowTimeoutMs,
  );
  const shortcut = await context.client.driver("appPaneLayoutPressMasterFocusShortcut");
  if (!shortcut.defaultPrevented) {
    throw new Error(`master pane focus shortcut was not handled: ${JSON.stringify(shortcut)}`);
  }
  const focusedMaster = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutMasterFocusState"),
    masterPaneFocusedByShortcut,
    workflowTimeoutMs,
  );
  const persistedShell = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutPersistedShellState", { workspaceRoot }),
    appLayoutShellPersisted,
    workflowTimeoutMs,
  );
  const activeConversationClose = await exerciseActiveConversationCloseAndReopen({
    backend,
    client: context.client,
    conversationId,
    workspaceId,
  });
  const refocusedMaster = await focusMasterPaneFromShortcut(context.client);
  const folderlessConversation = await context.client.driver(
    "appPaneLayoutCreateFolderlessConversationFromMaster",
  );
  if (folderlessConversation.status !== "passed") {
    throw new Error(
      `master folderless conversation create failed: ${JSON.stringify(folderlessConversation)}`,
    );
  }
  const folderlessConversationReopen = await exerciseFolderlessConversationCloseAndReopen({
    client: context.client,
    folderlessConversation,
  });

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    activeConversationClose,
    focusedMaster,
    folderlessConversation,
    folderlessConversationReopen,
    folderlessMasterAnswer,
    focusedPaneId: result.readBack.layout.focusedPaneId,
    persistedShell,
    refocusedMaster,
    restoredShell,
    status: "passed",
    workspaceId,
  });
  console.log(`Electron app pane layout workflow passed: ${artifactDir}`);
} catch (error) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  }).catch(() => {});
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function ensureWorkspaceOpen(client) {
  const current = await waitForState(
    client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => state.ready,
    workflowTimeoutMs,
  );
  if (validWorkspaceId(current.workspaceId)) {
    return current.workspaceId;
  }
  await openFixtureWorkspace(client, workflowTimeoutMs);
  const opened = await waitForState(
    client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

async function exerciseFolderlessMasterAnswer({ backend, client }) {
  const text = "Answer from folderless master.";
  const replyText = "The shell voice request was received.";
  const submitted = await client.driver("appPaneLayoutSubmitMasterText", {
    expectedResultKind: "answer_global",
    text,
  });
  assertDriverStatus(submitted, "folderless master direct answer");
  const route = await waitForMasterRouteDecision(backend, submitted.inputId, workflowTimeoutMs);
  assertMasterRouteDecision(route, {
    expectedInputId: submitted.inputId,
    expectedKind: "answer_global",
  });
  const actualReply = route.decision?.resultingCommand?.answerGlobal?.text ?? "";
  if (actualReply !== replyText) {
    throw new Error(`folderless master answer drifted: ${JSON.stringify(route)}`);
  }
  const transcript = await waitForMasterAnswerTranscript({
    backend,
    inputId: submitted.inputId,
    replyText,
    text,
  });
  await client.call("Page.reload", { ignoreCache: true });
  await waitForSelector(client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  await client.installDriver();
  const restoredTranscript = await waitForState(
    client,
    driverCallExpression("appPaneLayoutTranscriptState", {
      replyText,
      userText: text,
    }),
    (state) => state.userInputPresent && state.assistantReplyPresent,
    workflowTimeoutMs,
  );
  return {
    inputId: submitted.inputId,
    restoredEntryCount: restoredTranscript.entryCount,
    transcriptEntryCount: transcript.entries.length,
  };
}

function waitForMasterAnswerTranscript({ backend, inputId, replyText, text }) {
  return waitForBackendState(
    () => backend.post("/master/transcript/read", { limit: 20 }),
    (transcript) =>
      transcript.entries.some(
        (entry) =>
          entry.payload.inputId === inputId &&
          entry.payload.kind === "user_input" &&
          entry.payload.userInput?.text === text,
      ) &&
      transcript.entries.some(
        (entry) =>
          entry.payload.inputId === inputId &&
          entry.payload.kind === "assistant_reply" &&
          entry.payload.assistantReply?.replyKind === "answer" &&
          entry.payload.assistantReply?.text === replyText,
      ),
    workflowTimeoutMs,
  );
}

async function exerciseActiveConversationCloseAndReopen({
  backend,
  client,
  conversationId,
  workspaceId,
}) {
  const holdText = "hold app pane close active work";
  const openedBeforeClose = await client.driver("appPaneLayoutOpenConversationFromMaster", {
    conversationId,
  });
  assertDriverStatus(openedBeforeClose, "resource-bound conversation focus before close");
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text: holdText }),
    "submitted",
  );
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.state === "working" && surface.intentText === holdText,
  );
  const runningBeforeClose = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      turnTextHasStatus(snapshot, holdText, "running") &&
      snapshotHasAgentText(snapshot, `Streaming ${holdText}`),
  );
  const runningTurn = turnByText(runningBeforeClose, holdText);
  if (!runningTurn?.providerTurnId) {
    throw new Error(
      `active close turn lost provider identity: ${JSON.stringify(runningBeforeClose.turns)}`,
    );
  }

  const closed = await client.driver("appPaneLayoutCloseConversationPane", { conversationId });
  assertDriverStatus(closed, "resource-bound active conversation pane close");
  const runningAfterClose = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => {
      const turn = turnByText(snapshot, holdText);
      return (
        snapshot.conversation.status === "working" &&
        turn?.status === "running" &&
        turn.providerTurnId === runningTurn.providerTurnId
      );
    },
  );

  const reopened = await client.driver("appPaneLayoutOpenConversationFromMaster", {
    conversationId,
  });
  assertDriverStatus(reopened, "resource-bound conversation reopen after close");
  const reopenedSurface = await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.state === "working" && surface.intentText === holdText,
  );
  assertDriverAction(await client.driver("topicConversationStop", { conversationId }), "stopped");
  const stopped = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.conversation.status === "idle" && turnTextHasStatus(snapshot, holdText, "cancelled"),
  );

  return {
    closedPaneId: closed.paneId,
    providerTurnId: runningTurn.providerTurnId,
    reopenedPaneId: reopened.paneId,
    reopenedProjectionStatus: reopenedSurface.projectionStatus,
    runningTurnStatusAfterClose: turnByText(runningAfterClose, holdText)?.status ?? "",
    stoppedTurnStatus: turnByText(stopped, holdText)?.status ?? "",
  };
}

async function exerciseFolderlessConversationCloseAndReopen({ client, folderlessConversation }) {
  const { conversationId, paneId } = folderlessConversation;
  if (!conversationId || !paneId) {
    throw new Error(
      `folderless conversation result is incomplete: ${JSON.stringify(folderlessConversation)}`,
    );
  }
  const closed = await client.driver("appPaneLayoutCloseConversationPane", { conversationId });
  assertDriverStatus(closed, "folderless conversation pane close");
  const reopened = await client.driver("appPaneLayoutReopenFolderlessConversation", {
    conversationId,
    title: "New conversation",
  });
  assertDriverStatus(reopened, "folderless conversation pane reopen");
  if (reopened.resourceRoot !== "") {
    throw new Error(`folderless reopen gained a folder binding: ${JSON.stringify(reopened)}`);
  }
  const surface = await waitForState(
    client,
    driverCallExpression("appPaneLayoutConversationPaneState", { conversationId }),
    (state) => state.open && state.visible && state.projectionStatus === "unloaded",
    workflowTimeoutMs,
  );
  return {
    closedPaneId: closed.paneId,
    conversationId,
    reopenedPaneId: reopened.paneId,
    reopenedProjectionStatus: surface.projectionStatus,
  };
}

async function focusMasterPaneFromShortcut(client) {
  const shortcut = await client.driver("appPaneLayoutPressMasterFocusShortcut");
  if (!shortcut.defaultPrevented) {
    throw new Error(`master pane refocus shortcut was not handled: ${JSON.stringify(shortcut)}`);
  }
  return waitForState(
    client,
    driverCallExpression("appPaneLayoutMasterFocusState"),
    masterPaneFocusedByShortcut,
    workflowTimeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (current) => {
      const surface = conversationSurfaces(current.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    workflowTimeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

function snapshotHasAgentText(snapshot, expected) {
  return snapshot.trajectory.events.some((event) =>
    event.agentPublicTextDelta?.delta.includes(expected),
  );
}

function turnTextHasStatus(snapshot, text, status) {
  return turnByText(snapshot, text)?.status === status;
}

function turnByText(snapshot, text) {
  return snapshot.turns.turns.find((turn) => turn.authoredInput.text === text);
}

function assertDriverStatus(result, label) {
  if (result?.status !== "passed") {
    throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  }
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

async function createFixtureConversation(backend, workspaceId, title) {
  const snapshot = await backend.post("/conversations/create", { title, workspaceId });
  if (
    snapshot.conversation?.workspaceId !== workspaceId ||
    snapshot.conversation?.title !== title
  ) {
    throw new Error(`fixture conversation was not created: ${JSON.stringify(snapshot)}`);
  }
  return snapshot.conversation.id;
}

function shellLayoutRestored(state, workspaceId) {
  return (
    state.ready &&
    state.workspaceId === workspaceId &&
    state.paneCount === "3" &&
    state.maximizedPaneId === "app_shell_conversation" &&
    state.hosts.some(
      (host) => host.paneId === "app_shell_master" && host.surfaceKind === "master",
    ) &&
    state.hosts.some(
      (host) =>
        host.paneId === "app_shell_conversation" &&
        host.focused === "true" &&
        host.maximized === "true" &&
        host.surfaceKind === "conversation",
    )
  );
}

function appLayoutShellPersisted(state) {
  return (
    state.focusedPaneId === "app_shell_master" &&
    state.maximizedPaneId === "app_shell_master" &&
    state.resourceRoot === state.workspaceRoot &&
    state.surfaceKind === "conversation" &&
    state.columns.some(
      (column) =>
        column.columnId === "app_shell_column_master" &&
        column.index === 0 &&
        column.slotIndex === 0,
    ) &&
    state.columns.some(
      (column) =>
        column.columnId === "app_shell_column_0" && column.index === 1 && column.slotIndex === 1,
    ) &&
    state.columns.some(
      (column) =>
        column.columnId === "app_shell_column_1" && column.index === 2 && column.slotIndex === 2,
    )
  );
}

function masterPaneFocusedByShortcut(state) {
  return (
    state.ready &&
    state.maximizedPaneId === "app_shell_master" &&
    !state.masterOverlayOpen &&
    state.masterComposerFocused &&
    state.hosts.some(
      (host) =>
        host.paneId === "app_shell_master" &&
        host.focused === "true" &&
        host.maximized === "true" &&
        host.surfaceKind === "master",
    )
  );
}

function shellAppPaneLayout(workspaceRoot, conversationId) {
  return {
    columns: [
      {
        columnId: "app_shell_column_master",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: ["app_shell_master"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
      {
        columnId: "app_shell_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 1,
        paneIds: ["app_shell_empty"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 1,
        widthSpec: { unit: "px", value: 520 },
      },
      {
        columnId: "app_shell_column_1",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 2,
        paneIds: ["app_shell_conversation"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 2,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "app_shell_conversation",
    maximizedPaneId: "app_shell_conversation",
    panes: [
      {
        columnId: "app_shell_column_master",
        conversationConfig: null,
        heat: 0,
        masterConfig: {},
        paneId: "app_shell_master",
        sequence: 0,
        subtitle: "Global coordinator",
        surfaceId: "app_shell_surface_master",
        surfaceKind: "master",
        title: "Setta",
        tone: "slate",
        weight: 1,
      },
      {
        columnId: "app_shell_column_0",
        conversationConfig: null,
        heat: 0,
        masterConfig: null,
        paneId: "app_shell_empty",
        sequence: 0,
        subtitle: "Shell fixture",
        surfaceId: "app_shell_surface_empty",
        surfaceKind: "empty-frame",
        title: "Shell Frame",
        tone: "slate",
        weight: 1,
      },
      {
        columnId: "app_shell_column_1",
        conversationConfig: {
          conversationId,
          presentationIdentity: {
            subtitle: "Topic conversation",
            title: "Shell workflow topic",
            tone: "cyan",
          },
          resourceBindings: [{ folder: { rootPath: workspaceRoot }, kind: "folder" }],
        },
        heat: 37,
        masterConfig: null,
        paneId: "app_shell_conversation",
        sequence: 1,
        subtitle: "Topic conversation",
        surfaceId: "app_shell_surface_conversation",
        surfaceKind: "conversation",
        title: "Shell workflow topic",
        tone: "cyan",
        weight: 1,
      },
    ],
    schemaVersion: 1,
  };
}
