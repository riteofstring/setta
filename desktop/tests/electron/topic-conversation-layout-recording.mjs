import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";

const removedLayoutFields = [
  "activeRunStatus",
  "backgroundTerminalSurface",
  "chatDetailPane",
  "composer",
  "jumpToLatestButton",
  "queueSize",
  "selectedConversationId",
  "transcript",
  "transcriptScrollDebug",
  "visibleTurnIds",
];

export async function assertRecordedPaneLayouts(artifactDirectory, conversationIds, timeoutMs) {
  const expectedConversationIds = new Set(conversationIds);
  const startedAt = Date.now();
  let lastLayouts = [];
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(
      join(artifactDirectory, "renderer-events.jsonl"),
    );
    const layouts = events.filter((event) => event.type === "layout_snapshot");
    lastLayouts = layouts.slice(-5);
    assertRemovedLayoutFieldsAbsent(layouts);

    const recordedConversationIds = recordedConversationPaneIds(layouts, expectedConversationIds);
    if ([...expectedConversationIds].every((id) => recordedConversationIds.has(id))) {
      return;
    }
    await delay(20);
  }
  throw new Error(
    `conversation pane layout state was not recorded: ${JSON.stringify({ conversationIds, lastLayouts })}`,
  );
}

function recordedConversationPaneIds(layouts, expectedConversationIds) {
  const recordedConversationIds = new Set();
  for (const layout of layouts) {
    for (const pane of layout.panes ?? []) {
      const conversation = pane.conversation;
      if (
        expectedConversationIds.has(conversation?.id) &&
        validRecordedConversationPane(pane, conversation)
      ) {
        recordedConversationIds.add(conversation.id);
      }
    }
  }
  return recordedConversationIds;
}

function assertRemovedLayoutFieldsAbsent(layouts) {
  for (const layout of layouts) {
    const retained = removedLayoutFields.filter((field) => Object.hasOwn(layout, field));
    if (retained.length > 0) {
      throw new Error(`obsolete renderer layout fields were recorded: ${retained.join(", ")}`);
    }
  }
}

function validRecordedConversationPane(pane, conversation) {
  return [
    pane.surfaceKind === "easy-button",
    nonEmptyString(pane.paneId),
    typeof pane.focused === "boolean",
    typeof pane.visible === "boolean",
    nonEmptyString(conversation.paletteId),
    nonEmptyString(conversation.projectionStatus),
    nonNegativeInteger(conversation.queueCount),
    nonEmptyString(conversation.viewState),
  ].every(Boolean);
}

function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
