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

export async function exhaustNarratorVoiceCatalog(client, workspaceId) {
  const capabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  const master = await client.evaluate("window.setta.speech.readMasterVoiceSelection()");
  const page = await client.evaluate(
    `window.setta.conversations.list(${JSON.stringify({ cursor: null, limit: 80, query: "", workspaceId })})`,
  );
  const availableNarratorVoices = capabilities.voiceCatalog.voiceIds.filter(
    (voiceId) => voiceId !== master.resolvedVoiceId,
  );
  const creationCount = availableNarratorVoices.length - page.items.length + 1;
  if (creationCount < 1) {
    throw new Error(
      `voice exhaustion precondition is invalid: ${JSON.stringify({ availableNarratorVoices, page })}`,
    );
  }
  let exhausted = null;
  for (let index = 0; index < creationCount; index += 1) {
    exhausted = await client.evaluate(
      `window.setta.conversations.create(${JSON.stringify({
        title: `Voice exhaustion topic ${String(index + 1).padStart(2, "0")}`,
        workspaceId,
      })})`,
    );
  }
  return explicitNarratorReuse(exhausted, master.resolvedVoiceId);
}

function explicitNarratorReuse(exhausted, masterVoiceId) {
  if (exhausted === null) {
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

export async function updateMasterVoice(client, request) {
  return client.evaluate(
    `window.setta.speech.updateMasterVoiceSelection(${JSON.stringify(request)})`,
  );
}
