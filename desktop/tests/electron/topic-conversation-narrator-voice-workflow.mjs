import { waitForBackendState } from "./electron-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { waitForState } from "./electron-cdp-harness.mjs";
import { waitForPersistedConversationPane } from "./topic-conversation-fork-workflow.mjs";

export async function assertUnavailableExactVoiceErrors(client, workspaceId, conversationId) {
  const narratorError = await rejectedVoiceUpdate(client, "narrator", {
    conversationId,
    selection: { requestedVoiceId: "retired", selection: "exact" },
    workspaceId,
  });
  assertUnavailableVoiceError(narratorError, "narrator");
  const masterError = await rejectedVoiceUpdate(client, "master", {
    requestedVoiceId: "retired",
    selection: "exact",
  });
  assertUnavailableVoiceError(masterError, "master");
}

async function rejectedVoiceUpdate(client, target, request) {
  try {
    if (target === "master") {
      await client.evaluate(
        `window.setta.speech.updateMasterVoiceSelection(${JSON.stringify(request)})`,
      );
    } else {
      await client.driver("presentationConfigurationUpdateNarratorVoice", request);
    }
    return { message: "", rejected: false };
  } catch (error) {
    return { message: String(error?.message ?? error), rejected: true };
  }
}

function assertUnavailableVoiceError(result, target) {
  if (
    !result.rejected ||
    !result.message.includes("retired") ||
    !result.message.includes("not available")
  ) {
    throw new Error(`${target} unavailable exact voice result drifted: ${JSON.stringify(result)}`);
  }
}

export async function exhaustNarratorVoiceCatalog(client, backend, workspaceId, timeoutMs) {
  const capabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  const master = await client.evaluate("window.setta.speech.readMasterVoiceSelection()");
  const availableNarratorVoices = capabilities.voiceCatalog.voiceIds.filter(
    (voiceId) => voiceId !== master.resolvedVoiceId,
  );
  if (availableNarratorVoices.length < 1) {
    throw new Error(
      `voice exhaustion precondition is invalid: ${JSON.stringify({ availableNarratorVoices })}`,
    );
  }
  let exhausted = null;
  for (let index = 0; index <= availableNarratorVoices.length; index += 1) {
    const dormant = await client.evaluate(
      `window.setta.conversations.create(${JSON.stringify({
        title: `Voice exhaustion topic ${String(index + 1).padStart(2, "0")}`,
        workspaceId,
      })})`,
    );
    if (dormant.presentationProfile.narratorVoiceReuse !== null) {
      throw new Error(`dormant topic reported false voice exhaustion: ${JSON.stringify(dormant)}`);
    }
    const opened = await client.driver("topicConversationOpenBoundPane", {
      conversationId: dormant.conversation.id,
    });
    if (!opened.requested) {
      throw new Error(`voice exhaustion topic pane did not open: ${JSON.stringify(opened)}`);
    }
    await waitForPersistedConversationPane(
      backend,
      workspaceId,
      dormant.conversation.id,
      timeoutMs,
    );
    await waitForState(
      client,
      driverCallExpression("topicConversationSurfaceStates", {}),
      (state) =>
        state.surfaces.some(
          (surface) =>
            surface.conversationId === dormant.conversation.id &&
            surface.projectionStatus === "ready" &&
            !surface.inputDisabled,
        ),
      timeoutMs,
    );
    const submitted = await client.driver("topicConversationSubmit", {
      conversationId: dormant.conversation.id,
      text: `hold voice exhaustion ${String(index + 1).padStart(2, "0")}`,
    });
    if (!submitted.submitted) {
      throw new Error(`voice exhaustion topic did not start: ${JSON.stringify(submitted)}`);
    }
    await waitForBackendState(
      () =>
        backend.post("/conversations/snapshot/read", {
          conversationId: dormant.conversation.id,
          workspaceId,
        }),
      (snapshot) => snapshot.conversation.status === "working",
      timeoutMs,
    );
    const closed = await client.driver("topicConversationCloseOneBoundPane", {
      conversationId: dormant.conversation.id,
    });
    if (!closed.clicked) {
      throw new Error(`voice exhaustion topic pane did not close: ${JSON.stringify(closed)}`);
    }
    await waitForState(
      client,
      driverCallExpression("topicConversationSurfaceStates", {}),
      (state) =>
        state.surfaces.every((surface) => surface.conversationId !== dormant.conversation.id),
      timeoutMs,
    );
    await waitForBackendState(
      () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
      (result) =>
        result.layout?.panes.some(
          (pane) => pane.easyButtonConfig?.conversationId === dormant.conversation.id,
        ) !== true,
      timeoutMs,
    );
    const activePage = await waitForBackendState(
      () =>
        backend.post("/conversations/navigator/list", {
          cursor: null,
          limit: 80,
          query: "",
          workspaceId,
        }),
      (current) => current.items.some((item) => item.conversation.id === dormant.conversation.id),
      timeoutMs,
    );
    exhausted = activePage.items.find((item) => item.conversation.id === dormant.conversation.id);
    if (exhausted?.presentationProfile.narratorVoiceReuse !== null) {
      break;
    }
  }
  return explicitNarratorReuse(exhausted, master.resolvedVoiceId);
}

function explicitNarratorReuse(exhausted, masterVoiceId) {
  if (!exhausted) {
    throw new Error("finite narrator catalog exhaustion created no conversation");
  }
  const profile = exhausted.presentationProfile;
  if (
    profile.narratorVoiceSelection !== "auto_distinct" ||
    profile.resolvedNarratorVoiceId === masterVoiceId ||
    profile.narratorVoiceReuse?.reason !== "catalog_exhausted" ||
    profile.narratorVoiceReuse.conflictingConversationIds.length === 0
  ) {
    throw new Error(`finite narrator catalog reuse is not explicit: ${JSON.stringify(exhausted)}`);
  }
  return {
    id: exhausted.conversation.id,
    narratorVoiceId: profile.resolvedNarratorVoiceId,
    narratorVoiceReuse: profile.narratorVoiceReuse,
    title: exhausted.conversation.title,
  };
}

export function assertDistinctNarratorVoices(alpha, beta, masterVoiceId) {
  if (
    alpha.narratorVoiceId === beta.narratorVoiceId ||
    alpha.narratorVoiceId === masterVoiceId ||
    beta.narratorVoiceId === masterVoiceId
  ) {
    throw new Error(
      `automatic narrator voices are not distinct: ${JSON.stringify({ alpha, beta, masterVoiceId })}`,
    );
  }
}

export function narratorVoice(page, conversationId) {
  return page.items.find((item) => item.conversation.id === conversationId)?.presentationProfile
    .resolvedNarratorVoiceId;
}

export function assertPersistedNarratorVoice(page, conversation) {
  const item = page.items.find((candidate) => candidate.conversation.id === conversation.id);
  if (
    !item ||
    item.presentationProfile.resolvedNarratorVoiceId !== conversation.narratorVoiceId ||
    (conversation.narratorVoiceReuse !== undefined &&
      JSON.stringify(item.presentationProfile.narratorVoiceReuse) !==
        JSON.stringify(conversation.narratorVoiceReuse))
  ) {
    throw new Error(
      `narrator voice did not survive restart: ${JSON.stringify({ conversation, item })}`,
    );
  }
}

export function assertInactiveNarratorVoiceCapacityReleased(page, conversation, masterVoiceId) {
  const item = page.items.find((candidate) => candidate.conversation.id === conversation.id);
  if (!inactiveNarratorCapacityReleased(item, masterVoiceId)) {
    throw new Error(
      `inactive narrator retained active voice capacity: ${JSON.stringify({ conversation, item })}`,
    );
  }
}

function inactiveNarratorCapacityReleased(item, masterVoiceId) {
  return (
    item !== undefined &&
    item.conversation.status !== "working" &&
    inactiveAutomaticNarratorProfile(item.presentationProfile, masterVoiceId)
  );
}

function inactiveAutomaticNarratorProfile(profile, masterVoiceId) {
  return (
    profile.narratorVoiceSelection === "auto_distinct" &&
    profile.requestedNarratorVoiceId === null &&
    typeof profile.resolvedNarratorVoiceId === "string" &&
    profile.resolvedNarratorVoiceId !== masterVoiceId &&
    profile.narratorVoiceReuse === null
  );
}

export async function updateMasterVoice(client, request) {
  return client.evaluate(
    `window.setta.speech.updateMasterVoiceSelection(${JSON.stringify(request)})`,
  );
}
