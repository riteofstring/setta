import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import {
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonByAria,
  clickButtonByText,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  setInputValue,
  stopLaunchedContext,
  submitComposer,
  waitForBackendState,
  waitForDriverState,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function runTranscriptScrollWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("transcript-scroll");
  const recordingDir = join(recordingRoot, "transcript-scroll");
  const firstRecording = join(recordingDir, "first-launch");
  const secondRecording = join(recordingDir, "second-launch");
  const state = { first: null, firstLogs: [], second: null };
  let seeded;
  let failure = null;

  try {
    seeded = await runTranscriptScrollFirstLaunch({
      fixture,
      firstRecording,
      results,
      state,
    });
    await runTranscriptScrollSecondLaunch({
      fixture,
      results,
      secondRecording,
      seeded,
      state,
    });
  } catch (error) {
    failure = error;
    await captureTranscriptScrollFailure(state, recordingDir);
  } finally {
    await stopLaunchedContext(state.first);
    await stopLaunchedContext(state.second);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, transcriptScrollLogs(state));
  }
  await assertTranscriptScrollRecordingEvidence(firstRecording, secondRecording);
}

async function runTranscriptScrollFirstLaunch({ fixture, firstRecording, results, state }) {
  state.first = await launchContext(fixture, firstRecording);
  const backend = await backendProbe(firstRecording, state.first.client);
  const workspaceId = await openWorkspace(state.first.client, fixture.workspaceRoot, backend);
  let pagedConversationId = "";

  await runTranscriptScrollStep(
    results,
    firstRecording,
    "transcript-scroll",
    state.first.client,
    async () => {
      const streamingConversationId = await createChat(state.first.client, backend, workspaceId);
      await runTranscriptScrollStickinessWorkflow(
        state.first.client,
        backend,
        workspaceId,
        streamingConversationId,
      );
      pagedConversationId = await createChat(state.first.client, backend, workspaceId);
      await seedTranscriptOlderPageWorkflow(
        state.first.client,
        backend,
        workspaceId,
        pagedConversationId,
      );
    },
  );

  state.firstLogs = state.first.electron.logs;
  await stopLaunchedContext(state.first);
  return { pagedConversationId, workspaceId };
}

async function runTranscriptScrollSecondLaunch({
  fixture,
  results,
  secondRecording,
  seeded,
  state,
}) {
  state.second = await launchContext(fixture, secondRecording);
  const backend = await backendProbe(secondRecording, state.second.client);
  await waitForTexts(state.second.client, [
    "workspace-root",
    "transcript older page workflow",
    "Older page block 047",
  ]);
  await runTranscriptScrollStep(
    results,
    secondRecording,
    "transcript-scroll-reload",
    state.second.client,
    async () => {
      await runTranscriptOlderPageWorkflow(
        state.second.client,
        backend,
        seeded.workspaceId,
        seeded.pagedConversationId,
      );
    },
  );
}

async function runTranscriptScrollStep(results, recordingDir, name, client, workflow) {
  try {
    await workflow();
    await captureScreenshot(client, join(recordingDir, `${name}-success.png`));
  } catch (error) {
    await captureScreenshot(client, join(recordingDir, `${name}-failure.png`)).catch(() => {});
    throw error;
  }
  results.push(name);
  await appendWorkflowState(recordingDir, { name, status: "passed" });
  process.stdout.write(`Electron chat workflow passed: ${name}\n`);
}

async function runTranscriptScrollStickinessWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "transcript scroll stickiness workflow", "Send message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "transcript scroll stickiness workflow",
    "running",
  );
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId),
    (page) => pageText(page).includes("Scroll stickiness chunk 030"),
  );
  const scrollable = await waitForInitialScrollableTranscript(client);
  await assertUpwardWheelDetachesAutoFollowWhileStreaming(client);
  await assertTopNoOpWheelJumpToLatest(client);

  const detachedTop = Math.max(0, Math.floor(scrollable.maxScrollTop * 0.35));
  const scrolled = await scrollChatTranscript(client, { scrollTop: detachedTop });
  if (!scrolled.ok) {
    throw new Error(`transcript did not scroll away from tail: ${JSON.stringify(scrolled)}`);
  }
  const detached = await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "user_detached" &&
      !snapshot.debug.atBottom &&
      snapshot.debug.distanceFromBottom > 96,
    "detached after manual scroll",
  );
  const afterGrowth = await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.tailRevision !== detached.debug.tailRevision &&
      snapshot.debug.mode === "user_detached" &&
      !snapshot.debug.atBottom &&
      snapshot.debug.distanceFromBottom > 96,
    "detached while streaming grows tail",
  );
  if (afterGrowth.debug.scrollTop < detached.debug.scrollTop - 2) {
    throw new Error(
      `detached transcript unexpectedly moved upward: before=${JSON.stringify(detached.debug)} after=${JSON.stringify(afterGrowth.debug)}`,
    );
  }
  await clickButtonByAria(client, "Jump to latest");
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" && snapshot.debug.atBottom && !snapshot.jumpVisible,
    "auto-follow after jump to latest",
  );
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId),
    (page) => pageText(page).includes("Scroll stickiness chunk 650"),
  );
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" &&
      snapshot.debug.atBottom &&
      !snapshot.jumpVisible &&
      snapshot.visibleRows.some((row) => row.text.includes("Scroll stickiness chunk 650")),
    "auto-follow keeps chunk 650 visible",
  );
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, "completed");
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId),
    (page) => pageText(page).includes("Scroll stickiness final line."),
  );
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" && snapshot.debug.atBottom && !snapshot.jumpVisible,
    "auto-follow after final line",
  );
  await openChatSearch(client);
  await setInputValue(
    client,
    'input[placeholder="Search chat"]',
    "transcript scroll stickiness workflow",
  );
  await waitForActiveSearchMessage(client, "transcript scroll stickiness workflow");
  await clickButtonByAria(client, "Close chat search");
}

async function waitForInitialScrollableTranscript(client) {
  return waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" &&
      snapshot.debug.atBottom &&
      !snapshot.jumpVisible &&
      snapshot.debug.scrollHeight > snapshot.debug.clientHeight + 240,
    "initial auto-follow scrollable transcript",
  );
}

async function assertUpwardWheelDetachesAutoFollowWhileStreaming(client) {
  const beforeWheel = await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" && snapshot.debug.atBottom && !snapshot.jumpVisible,
    "auto-follow before upward wheel while streaming",
  );
  const nearBottomScrolled = await scrollChatTranscript(client, {
    debugDetach: false,
    distanceFromBottom: 128,
  });
  if (!nearBottomScrolled.ok) {
    throw new Error(
      `transcript did not perform upward-wheel history scroll: ${JSON.stringify(nearBottomScrolled)}`,
    );
  }
  if (
    nearBottomScrolled.afterWheelSnapshot?.debug?.mode !== "user_detached" ||
    nearBottomScrolled.afterWheelSnapshot.debug.atBottom !== true
  ) {
    throw new Error(
      `upward wheel did not detach through production event handling before scrollTop mutation: ${JSON.stringify(nearBottomScrolled.afterWheelSnapshot)}`,
    );
  }
  const detached = await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "user_detached" &&
      snapshot.debug.tailRevision >= beforeWheel.debug.tailRevision &&
      !snapshot.debug.atBottom &&
      snapshot.debug.distanceFromBottom > 96,
    "detached after upward-wheel history scroll while streaming",
  );
  const afterGrowth = await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.tailRevision !== detached.debug.tailRevision &&
      snapshot.debug.mode === "user_detached" &&
      !snapshot.debug.atBottom &&
      snapshot.debug.distanceFromBottom > 96 &&
      snapshot.jumpVisible,
    "still detached after streaming growth from upward-wheel history scroll",
  );
  if (afterGrowth.debug.distanceFromBottom <= detached.debug.distanceFromBottom) {
    throw new Error(
      `upward-wheel detached transcript unexpectedly followed the tail: before=${JSON.stringify(detached.debug)} after=${JSON.stringify(afterGrowth.debug)}`,
    );
  }
  await clickButtonByAria(client, "Jump to latest");
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" && snapshot.debug.atBottom && !snapshot.jumpVisible,
    "auto-follow after upward-wheel jump to latest",
  );
}

async function assertTopNoOpWheelJumpToLatest(client) {
  const topScroll = await scrollChatTranscript(client, { position: "top" });
  if (!topScroll.ok) {
    throw new Error(`transcript did not scroll to the top: ${JSON.stringify(topScroll)}`);
  }
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "user_detached" &&
      !snapshot.debug.atBottom &&
      snapshot.debug.scrollTop === 0,
    "detached at transcript top",
  );
  const noOpUpwardWheel = await wheelChatTranscript(client, -1);
  if (!noOpUpwardWheel.ok) {
    throw new Error(
      `transcript did not dispatch top no-op wheel: ${JSON.stringify(noOpUpwardWheel)}`,
    );
  }
  await clickButtonByAria(client, "Jump to latest");
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.debug.mode === "auto_follow" && snapshot.debug.atBottom && !snapshot.jumpVisible,
    "auto-follow after top no-op wheel jump to latest",
  );
}

async function seedTranscriptOlderPageWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "transcript older page workflow", "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "transcript older page workflow",
    "completed",
  );
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId, 40),
    (page) =>
      page.hasMoreOlder &&
      pageBlocksText(page).includes("Older page block 047") &&
      !pageBlocksText(page).includes("Older page block 000"),
  );
}

async function runTranscriptOlderPageWorkflow(client, backend, workspaceId, conversationId) {
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId, 40),
    (page) =>
      page.hasMoreOlder &&
      pageBlocksText(page).includes("Older page block 047") &&
      !pageBlocksText(page).includes("Older page block 000"),
  );
  const topScroll = await scrollChatTranscript(client, { position: "top" });
  if (!topScroll.ok) {
    throw new Error(`transcript older-page setup did not scroll: ${JSON.stringify(topScroll)}`);
  }
  const before = topScroll.snapshot;
  if (
    !before.ready ||
    before.scrollTop !== 0 ||
    before.maxScrollTop <= 0 ||
    !before.visibleRows.some((row) => row.text.includes("Older page block"))
  ) {
    throw new Error(`older-page setup did not reach transcript top: ${JSON.stringify(before)}`);
  }
  const anchorText = firstVisibleOlderPageBlock(before);
  await clickButtonByText(client, "Older");
  await waitForText(client, "Older page block 000");
  await waitForTranscriptScrollSnapshot(
    client,
    (snapshot) =>
      snapshot.scrollTop > 0 && snapshot.visibleRows.some((row) => row.text.includes(anchorText)),
    "older-page anchor preserved after loading older blocks",
  );
}

async function waitForTranscriptScrollSnapshot(client, predicate, label) {
  try {
    return await waitForDriverState(
      client,
      "chatTranscriptScrollSnapshot",
      {},
      (snapshot) => snapshot.ready && predicate(snapshot),
    );
  } catch (error) {
    throw new Error(`transcript scroll wait failed: ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

async function scrollChatTranscript(client, options) {
  return client.driver("scrollChatTranscript", options);
}

async function wheelChatTranscript(client, deltaY) {
  return client.driver("wheelChatTranscript", { deltaY });
}

async function openChatSearch(client) {
  await client.driver("openChatSearch");
  await waitForDriverState(client, "chatSearchState", {}, (value) => value.open);
}

async function waitForActiveSearchMessage(client, expectedText) {
  await waitForState(
    client,
    `(() => {
      const row = document.querySelector('[data-search-active="true"]');
      return {
        activeMessageId: row?.getAttribute("data-message-id") ?? "",
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.text.includes(expectedText),
  );
}

async function messagePage(backend, workspaceId, conversationId, limit = 80) {
  return backend.post("/chat/messages/page", {
    conversationId,
    limit,
    workspaceId,
  });
}

function pageText(page) {
  return JSON.stringify(page);
}

function pageBlocksText(page) {
  return JSON.stringify(page.blocks);
}

function firstVisibleOlderPageBlock(snapshot) {
  const row = snapshot.visibleRows.find((candidate) => candidate.text.includes("Older page block"));
  const match = row?.text.match(/Older page block \d{3}/);
  if (!match) {
    throw new Error(`older page anchor row was not visible: ${JSON.stringify(snapshot)}`);
  }
  return match[0];
}

function captureTranscriptScrollFailure(state, recordingDir) {
  return captureScreenshot(
    state.first?.client ?? state.second?.client,
    join(recordingDir, "failure.png"),
  ).catch(() => {});
}

function transcriptScrollLogs(state) {
  return [
    ...state.firstLogs,
    ...(state.first?.electron.logs ?? []),
    ...(state.second?.electron.logs ?? []),
  ];
}

async function assertTranscriptScrollRecordingEvidence(firstRecording, secondRecording) {
  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:message-page",
    ],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: ["/chat/messages/page"],
    ipcChannels: ["chat:message-page"],
  });
}
