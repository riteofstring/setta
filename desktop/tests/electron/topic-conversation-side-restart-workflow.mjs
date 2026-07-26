import { delimiter, join } from "node:path";
import process from "node:process";

import { backendProbe } from "./electron-workflow-harness.mjs";
import {
  captureScreenshot,
  launchElectronCdpContext,
  stopElectronCdpContext,
  waitForSelector,
} from "./electron-cdp-harness.mjs";

export async function verifySideConversationRestart({
  alpha,
  alphaFork,
  alphaForkTerminalSnapshot,
  alphaRestartSide,
  alphaSide,
  artifactDir,
  backend,
  context,
  fakeCodex,
  fixture,
  openWorkspace,
  speechProvider,
  visible,
  waitForConversationSnapshot,
  workspaceId,
}) {
  const alphaForkReloadedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alphaFork.id,
    (snapshot) =>
      snapshot.eventCursor.sequence === alphaForkTerminalSnapshot.eventCursor.sequence &&
      snapshot.turns.turns[0]?.status === "completed" &&
      snapshot.branch?.parentConversationId === alpha.id &&
      snapshot.branch?.decisionSource === "conversation_router",
  );
  const alphaSideReloadedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (side) =>
          side.id === alphaSide.id &&
          side.status === "disposing" &&
          side.decisionSource === "conversation_router" &&
          side.disposedAt !== null &&
          side.providerThreadId === alphaSide.providerThreadId,
      ),
  );
  const alphaRestartSideReloadedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (side) =>
          side.id === alphaRestartSide.id &&
          side.status === "active" &&
          side.decisionSource === "conversation_router" &&
          side.disposedAt === null &&
          side.activeTurnId !== null &&
          side.activeProviderTurnId !== null,
      ),
  );
  await captureScreenshot(context.client, join(artifactDir, "commands-reloaded.png"));

  await stopElectronCdpContext(context);
  const restarted = await launchRestartedElectron({
    artifactDir: join(artifactDir, "third-launch"),
    fakeCodex,
    fixture,
    speechProvider,
    visible,
  });
  try {
    await waitForSelector(restarted.client, '[data-testid="workspace-layout-area"]');
    await restarted.client.installDriver();
    const restartedBackend = await backendProbe(
      join(artifactDir, "third-launch"),
      restarted.client,
    );
    const thirdLaunchWorkspaceId = await openWorkspace(restarted.client);
    if (thirdLaunchWorkspaceId !== workspaceId) {
      throw new Error(
        `workspace changed during side recovery restart: ${JSON.stringify({ thirdLaunchWorkspaceId, workspaceId })}`,
      );
    }
    const alphaRestartSideRecoveredSnapshot = await waitForConversationSnapshot(
      restartedBackend,
      workspaceId,
      alpha.id,
      (snapshot) =>
        snapshot.sideConversations.some(
          (side) =>
            side.id === alphaRestartSide.id &&
            side.status === "disposing" &&
            side.decisionSource === "conversation_router" &&
            side.disposedAt !== null &&
            side.resolvedSideAgentInvocation.outcome === "cancelled",
        ) &&
        snapshot.sideEvents.events.some(
          (event) =>
            event.sideConversationId === alphaRestartSide.id &&
            event.event.kind === "turn_interrupted",
        ),
    );
    return {
      alphaForkReloadedSnapshot,
      alphaRestartSideRecoveredSnapshot,
      alphaRestartSideReloadedSnapshot,
      alphaSideReloadedSnapshot,
      context: restarted,
    };
  } catch (error) {
    await stopElectronCdpContext(restarted);
    throw error;
  }
}

function launchRestartedElectron({ artifactDir, fakeCodex, fixture, speechProvider, visible }) {
  return launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      OPENAI_API_KEY: speechProvider.apiKey,
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible,
  });
}
