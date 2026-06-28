import type { IpcRenderer } from "electron";

import { recordingRendererEventChannel, type RendererRecordedEvent } from "@shared/recording";

const maxTextLength = 160;
const maxRecordedTextLength = 2_000;
const volatileRecordedTextSelector = '[data-recording-volatile-text="true"]';
const interestingKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Enter",
  "Escape",
  "Tab",
]);

const chatUIRootSelector = [
  '[data-testid="chat-detail-pane"]',
  '[data-testid="chat-transcript-region"]',
  '[data-testid="chat-transcript-scroller"]',
  '[data-testid="chat-composer"]',
  '[data-testid="chat-goal-status"]',
  '[data-testid="chat-load-error"]',
  '[data-testid="empty-chat"]',
].join(",");

const chatUIElementSelector = [
  '[data-transcript-block="true"]',
  '[data-chat-message="true"]',
  '[data-testid="run-activity-row"]',
  '[data-testid="activity-group-slot"]',
  '[data-testid="activity-group-bulk-toggle"]',
  '[data-testid="approval-card"]',
  '[data-testid="chat-message-actions"]',
  '[data-testid="chat-message-timestamp"]',
  '[data-testid="chat-queued-turn-row"]',
  "textarea[aria-label]",
  "button[aria-label]",
].join(",");

const chatUIFloatingRootSelector = [
  '[data-testid="command-palette"]',
  '[data-testid="model-picker"]',
].join(",");

const chatUITestIdKinds: Record<string, string> = {
  "activity-group-bulk-toggle": "activity_group_bulk_toggle",
  "activity-group-slot": "activity_group_slot",
  "approval-card": "approval_card",
  "chat-composer": "chat_composer",
  "chat-detail-pane": "chat_detail_pane",
  "chat-goal-status": "chat_goal_status",
  "chat-load-error": "chat_load_error",
  "chat-message-actions": "message_actions",
  "chat-message-timestamp": "message_timestamp",
  "chat-queued-turn-row": "queued_message",
  "chat-transcript-region": "chat_transcript_region",
  "chat-transcript-scroller": "chat_transcript_scroller",
  "command-palette": "command_palette",
  "empty-chat": "empty_chat",
  "model-picker": "model_picker",
  "run-activity-row": "activity_row",
};

export function installRendererRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  if (!isRecordingEnabled()) {
    return;
  }
  const layoutRecorder = createLayoutRecorder(ipcRenderer);
  const chatUIRecorder = createChatUIRecorder(ipcRenderer);

  window.addEventListener(
    "click",
    (event) => {
      record(ipcRenderer, {
        at: timestamp(),
        button: event.button,
        target: summarizeTarget(event.target),
        type: "click",
        url: window.location.href,
      });
      layoutRecorder.schedule("click");
      chatUIRecorder.schedule("click");
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (!shouldRecordKeydown(event)) {
        return;
      }
      record(ipcRenderer, {
        altKey: event.altKey,
        at: timestamp(),
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: summarizeTarget(event.target),
        type: "keydown",
        url: window.location.href,
      });
      layoutRecorder.schedule("keydown");
      chatUIRecorder.schedule("keydown");
    },
    true,
  );

  window.addEventListener(
    "submit",
    (event) => {
      record(ipcRenderer, {
        at: timestamp(),
        target: summarizeTarget(event.target),
        type: "submit",
        url: window.location.href,
      });
      layoutRecorder.schedule("submit");
      chatUIRecorder.schedule("submit");
    },
    true,
  );

  window.addEventListener(
    "input",
    (event) => {
      if (isChatUITarget(event.target)) {
        chatUIRecorder.schedule("input");
      }
    },
    true,
  );

  window.addEventListener(
    "scroll",
    (event) => {
      if (event.target === document || isChatUITarget(event.target)) {
        chatUIRecorder.schedule("scroll");
      }
    },
    true,
  );

  window.addEventListener("error", (event) => {
    record(ipcRenderer, {
      at: timestamp(),
      message: truncate(event.message),
      source: truncate(event.filename),
      type: "error",
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    record(ipcRenderer, {
      at: timestamp(),
      reason: truncate(String(event.reason)),
      type: "unhandledrejection",
      url: window.location.href,
    });
  });

  window.addEventListener("resize", () => {
    layoutRecorder.schedule("resize");
    chatUIRecorder.schedule("resize");
  });

  window.addEventListener("load", () => {
    layoutRecorder.schedule("renderer_load");
    chatUIRecorder.schedule("renderer_load");
  });
  window.addEventListener("setta:record-layout-snapshot", (event) => {
    layoutRecorder.capture(layoutSnapshotTrigger(event));
    chatUIRecorder.capture(layoutSnapshotTrigger(event));
  });
  window.addEventListener("beforeunload", () => {
    layoutRecorder.capture("before_unload");
    chatUIRecorder.capture("before_unload");
  });
  layoutRecorder.observe();
  chatUIRecorder.observe();
}

function isRecordingEnabled(): boolean {
  const env = typeof process === "undefined" ? undefined : process.env;
  return env?.SETTA_RECORDING === "1" || env?.SETTA_RECORDING_DIR !== undefined;
}

function shouldRecordKeydown(event: KeyboardEvent): boolean {
  return interestingKeys.has(event.key) || event.metaKey || event.ctrlKey;
}

function record(ipcRenderer: Pick<IpcRenderer, "send">, event: RendererRecordedEvent) {
  ipcRenderer.send(recordingRendererEventChannel, event);
}

function createLayoutRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  let pending = 0;
  let lastCapturedAt = 0;

  return {
    capture(trigger: string) {
      lastCapturedAt = Date.now();
      record(ipcRenderer, layoutSnapshot(trigger));
    },
    observe() {
      const target = document.body ?? document.documentElement;
      if (!target) {
        window.addEventListener("DOMContentLoaded", () => this.observe(), { once: true });
        return;
      }
      const observer = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCapturedAt < 250) {
          return;
        }
        this.schedule("dom_mutation");
      });
      observer.observe(target, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    },
    schedule(trigger: string) {
      if (pending !== 0) {
        return;
      }
      pending = window.setTimeout(() => {
        pending = 0;
        this.capture(trigger);
      }, 0);
    },
  };
}

function createChatUIRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  let pending = 0;
  let lastSnapshotSignature = "";
  let lastElementSignatures = new Map<string, string>();

  return {
    capture(trigger: string) {
      const snapshot = chatUISnapshot(trigger, lastElementSignatures);
      const nextSnapshotSignature = chatUISnapshotSignature(snapshot);
      if (nextSnapshotSignature === lastSnapshotSignature) {
        return;
      }
      lastSnapshotSignature = nextSnapshotSignature;
      lastElementSignatures = new Map(
        snapshot.elements.map((element) => [element.key, chatUIElementSignature(element)]),
      );
      record(ipcRenderer, snapshot);
    },
    observe() {
      const target = document.body ?? document.documentElement;
      if (!target) {
        window.addEventListener("DOMContentLoaded", () => this.observe(), { once: true });
        return;
      }
      const observer = new MutationObserver((mutations) => {
        if (!mutations.some((mutation) => isChatUIMutation(mutation))) {
          return;
        }
        this.schedule("chat_dom_mutation");
      });
      observer.observe(target, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    },
    schedule(trigger: string) {
      if (pending !== 0) {
        return;
      }
      pending = window.setTimeout(() => {
        pending = 0;
        this.capture(trigger);
      }, 0);
    },
  };
}

function chatUISnapshot(trigger: string, previousElementSignatures: Map<string, string>) {
  const pane = document.querySelector('[data-testid="chat-detail-pane"]');
  const transcript = document.querySelector('[data-testid="chat-transcript-region"]');
  const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
  const elements = collectChatUIElements();
  const summaries = summarizeChatUIElements(elements);
  const nextElementSignatures = new Map(
    summaries.map((element) => [element.key, chatUIElementSignature(element)]),
  );
  const appeared = summaries
    .map((element) => element.key)
    .filter((key) => !previousElementSignatures.has(key));
  const updated = summaries
    .map((element) => element.key)
    .filter((key) => {
      const previousSignature = previousElementSignatures.get(key);
      return (
        previousSignature !== undefined && previousSignature !== nextElementSignatures.get(key)
      );
    });
  const disappeared = Array.from(previousElementSignatures.keys()).filter(
    (key) => !nextElementSignatures.has(key),
  );

  return {
    activeElementKey: activeChatUIElementKey(elements, summaries),
    activeRunStatus: pane?.getAttribute("data-run-status") ?? "",
    appeared,
    at: timestamp(),
    disappeared,
    elementCount: summaries.length,
    elements: summaries,
    selectedConversationId: pane?.getAttribute("data-conversation-id") ?? "",
    transcript: scrollRect(transcript, scroller),
    trigger,
    type: "chat_ui_snapshot" as const,
    updated,
    url: window.location.href,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
    visibleElementCount: summaries.filter((element) => element.visible).length,
    workspaceId: pane?.getAttribute("data-workspace-id") ?? "",
  };
}

function collectChatUIElements(): Element[] {
  const elements = new Set<Element>();
  const add = (element: Element | null) => {
    if (element) {
      elements.add(element);
    }
  };
  const roots = Array.from(
    document.querySelectorAll(`${chatUIRootSelector},${chatUIFloatingRootSelector}`),
  );
  for (const root of roots) {
    add(root);
    root.querySelectorAll(chatUIElementSelector).forEach(add);
  }
  return Array.from(elements);
}

function summarizeChatUIElements(elements: Element[]) {
  const usedKeys = new Map<string, number>();
  return elements
    .map((element, index) => summarizeChatUIElement(element, index, usedKeys))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function summarizeChatUIElement(element: Element, index: number, usedKeys: Map<string, number>) {
  const text = chatUIText(element);
  return {
    key: uniqueChatUIElementKey(baseChatUIElementKey(element, index), usedKeys),
    kind: chatUIElementKind(element),
    rect: elementRect(element),
    state: chatUIElementState(element),
    textHash: hashString(text.value),
    textLength: text.length,
    textPreview: truncate(text.value),
    textTruncated: text.truncated,
    visible: elementVisibleInViewport(element),
  };
}

function baseChatUIElementKey(element: Element, index: number): string {
  const stableKey = stableChatUIElementKey(element);
  if (stableKey !== null) {
    return stableKey;
  }
  const contextualKey = contextualChatUIElementKey(element);
  if (contextualKey !== null) {
    return contextualKey;
  }
  return `${chatUIElementKind(element)}:${index}`;
}

function stableChatUIElementKey(element: Element): string | null {
  return messageElementKey(element) ?? runItemElementKey(element) ?? runStatusElementKey(element);
}

function messageElementKey(element: Element): string | null {
  const messageId = element.getAttribute("data-message-id") ?? "";
  return messageId === "" ? null : `message:${messageId}`;
}

function runItemElementKey(element: Element): string | null {
  const runItemId = element.getAttribute("data-run-item-id") ?? "";
  return runItemId === "" ? null : `run-item:${runItemId}`;
}

function runStatusElementKey(element: Element): string | null {
  const blockKind = element.getAttribute("data-block-kind") ?? "";
  const runId = element.getAttribute("data-run-id") ?? "";
  if (blockKind === "run_status" && runId !== "") {
    return `run-status:${runId}:${element.getAttribute("data-run-status-mode") ?? ""}`;
  }
  return null;
}

function contextualChatUIElementKey(element: Element): string | null {
  const testId = element.getAttribute("data-testid") ?? "";
  if (testId !== "") {
    return `testid:${testId}:${chatUIContextKey(element)}`;
  }
  if (element instanceof HTMLTextAreaElement) {
    return `textarea:${chatUIContextKey(element)}`;
  }
  if (element instanceof HTMLButtonElement) {
    return `button:${chatUIContextKey(element)}:${element.getAttribute("aria-label") ?? ""}`;
  }
  return null;
}

function uniqueChatUIElementKey(baseKey: string, usedKeys: Map<string, number>): string {
  const count = usedKeys.get(baseKey) ?? 0;
  usedKeys.set(baseKey, count + 1);
  return count === 0 ? baseKey : `${baseKey}#${count + 1}`;
}

function chatUIContextKey(element: Element): string {
  return (
    closestAttributeContext(element, "[data-message-id]", "data-message-id", "message") ??
    closestAttributeContext(element, "[data-run-item-id]", "data-run-item-id", "run-item") ??
    closestChatPaneContext(element) ??
    "chat"
  );
}

function closestAttributeContext(
  element: Element,
  selector: string,
  attribute: string,
  prefix: string,
): string | null {
  const value = element.closest(selector)?.getAttribute(attribute) ?? "";
  return value === "" ? null : `${prefix}:${value}`;
}

function closestChatPaneContext(element: Element): string | null {
  const pane = element.closest('[data-testid="chat-detail-pane"]');
  const conversationId = pane?.getAttribute("data-conversation-id") ?? "";
  return conversationId === "" ? null : `conversation:${conversationId}`;
}

function chatUIElementKind(element: Element): string {
  return (
    transcriptBlockElementKind(element) ??
    chatMessageElementKind(element) ??
    testIdElementKind(element) ??
    controlElementKind(element) ??
    fallbackChatUIElementKind(element)
  );
}

function transcriptBlockElementKind(element: Element): string | null {
  const blockKind = element.getAttribute("data-block-kind") ?? "";
  if (element.getAttribute("data-transcript-block") === "true") {
    return blockKind === "" ? "transcript_block" : `transcript_${blockKind}`;
  }
  return null;
}

function chatMessageElementKind(element: Element): string | null {
  if (element.getAttribute("data-chat-message") === "true") {
    const role = element.getAttribute("data-message-role") ?? "unknown";
    return `message_${role}`;
  }
  return null;
}

function testIdElementKind(element: Element): string | null {
  const testId = element.getAttribute("data-testid") ?? "";
  return chatUITestIdKinds[testId] ?? null;
}

function controlElementKind(element: Element): string | null {
  if (element instanceof HTMLTextAreaElement) {
    return "composer_textarea";
  }
  if (element instanceof HTMLButtonElement) {
    return "chat_button";
  }
  return null;
}

function fallbackChatUIElementKind(element: Element): string {
  const testId = element.getAttribute("data-testid") ?? "";
  return testId === "" ? element.tagName.toLowerCase() : testId;
}

function chatUIElementState(element: Element): Record<string, string | number | boolean | null> {
  const state: Record<string, string | number | boolean | null> = {};
  addAttributeState(state, element, "aria-label", "ariaLabel");
  addAttributeState(state, element, "data-testid", "testId");
  addAttributeState(state, element, "data-block-kind", "blockKind");
  addAttributeState(state, element, "data-conversation-id", "conversationId");
  addAttributeState(state, element, "data-goal-status", "goalStatus");
  addAttributeState(state, element, "data-message-delivery", "messageDelivery");
  addAttributeState(state, element, "data-message-id", "messageId");
  addAttributeState(state, element, "data-message-ordinal", "messageOrdinal");
  addAttributeState(state, element, "data-message-role", "messageRole");
  addAttributeState(state, element, "data-message-status", "messageStatus");
  addAttributeState(state, element, "data-run-id", "runId");
  addAttributeState(state, element, "data-run-item-id", "runItemId");
  addAttributeState(state, element, "data-run-item-status", "runItemStatus");
  addAttributeState(state, element, "data-run-item-title", "runItemTitle");
  addAttributeState(state, element, "data-run-item-type", "runItemType");
  addAttributeState(state, element, "data-run-status", "activeRunStatus");
  addAttributeState(state, element, "data-run-status-mode", "runStatusMode");
  addAttributeState(state, element, "data-search-active", "searchActive");
  addAttributeState(state, element, "data-workspace-id", "workspaceId");
  state.focused = element === document.activeElement || element.contains(document.activeElement);
  if (element instanceof HTMLDetailsElement) {
    state.open = element.open;
  }
  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    state.disabled = element.disabled;
  }
  if (element instanceof HTMLTextAreaElement) {
    state.placeholder = truncate(element.placeholder);
    state.valueHash = hashString(element.value);
    state.valueLength = Array.from(element.value).length;
  }
  return state;
}

function addAttributeState(
  state: Record<string, string | number | boolean | null>,
  element: Element,
  attribute: string,
  key: string,
) {
  const value = element.getAttribute(attribute);
  if (value === null) {
    return;
  }
  state[key] = truncate(value);
}

function activeChatUIElementKey(
  elements: Element[],
  summaries: ReturnType<typeof summarizeChatUIElements>,
) {
  const active = document.activeElement;
  if (!active) {
    return "";
  }
  return activeChatUIElementKeyFromElement(active, elements, summaries) ?? "";
}

function activeChatUIElementKeyFromElement(
  active: Element,
  elements: Element[],
  summaries: ReturnType<typeof summarizeChatUIElements>,
): string | null {
  const exact = summarizedChatUIElementKey(active, elements, summaries);
  if (exact !== null) {
    return exact;
  }
  const closest = closestChatUITrackedElement(active);
  return closest === null ? null : summarizedChatUIElementKey(closest, elements, summaries);
}

function closestChatUITrackedElement(element: Element): Element | null {
  const closestElement = element.closest(chatUIElementSelector);
  if (
    closestElement &&
    closestElement.closest(`${chatUIRootSelector},${chatUIFloatingRootSelector}`)
  ) {
    return closestElement;
  }
  return element.closest(chatUIRootSelector) ?? element.closest(chatUIFloatingRootSelector);
}

function summarizedChatUIElementKey(
  element: Element,
  elements: Element[],
  summaries: ReturnType<typeof summarizeChatUIElements>,
): string | null {
  const index = elements.findIndex((candidate) => candidate === element);
  if (index === -1) {
    return null;
  }
  return matchingSummaryKey(baseChatUIElementKey(element, index), summaries);
}

function matchingSummaryKey(
  baseKey: string,
  summaries: ReturnType<typeof summarizeChatUIElements>,
): string | null {
  return (
    summaries.find((summary) => summary.key === baseKey || summary.key.startsWith(`${baseKey}#`))
      ?.key ?? null
  );
}

function chatUIText(element: Element): RecordedText {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return recordableString(element.value);
  }
  return recordableElementText(element);
}

function elementVisibleInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function chatUIElementSignature(element: ReturnType<typeof summarizeChatUIElement>): string {
  return JSON.stringify({
    kind: element.kind,
    rect: element.rect,
    state: element.state,
    textHash: element.textHash,
    textLength: element.textLength,
    textTruncated: element.textTruncated,
    visible: element.visible,
  });
}

function chatUISnapshotSignature(snapshot: ReturnType<typeof chatUISnapshot>): string {
  return JSON.stringify({
    activeElementKey: snapshot.activeElementKey,
    activeRunStatus: snapshot.activeRunStatus,
    elements: snapshot.elements.map((element) => [element.key, chatUIElementSignature(element)]),
    selectedConversationId: snapshot.selectedConversationId,
    transcript: snapshot.transcript,
    viewport: snapshot.viewport,
    workspaceId: snapshot.workspaceId,
  });
}

function isChatUITarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return isChatUIElement(target);
}

function isChatUIElement(element: Element): boolean {
  return (
    element.matches(chatUIRootSelector) ||
    element.matches(chatUIFloatingRootSelector) ||
    element.closest(chatUIRootSelector) !== null ||
    element.closest(chatUIFloatingRootSelector) !== null
  );
}

function isChatUIMutation(mutation: MutationRecord): boolean {
  if (isVolatileTextMutation(mutation)) {
    return false;
  }
  if (mutation.target instanceof Element && isChatUIElement(mutation.target)) {
    return true;
  }
  if (
    mutation.target instanceof CharacterData &&
    mutation.target.parentElement &&
    isChatUIElement(mutation.target.parentElement)
  ) {
    return true;
  }
  return (
    Array.from(mutation.addedNodes).some(isChatUINode) ||
    Array.from(mutation.removedNodes).some(isChatUINode)
  );
}

function isChatUINode(node: Node): boolean {
  return node instanceof Element && isChatUIElement(node);
}

function isVolatileTextMutation(mutation: MutationRecord): boolean {
  return (
    mutation.type === "characterData" &&
    mutation.target instanceof CharacterData &&
    mutation.target.parentElement !== null &&
    mutation.target.parentElement.closest(volatileRecordedTextSelector) !== null
  );
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function layoutSnapshot(trigger: string): RendererRecordedEvent {
  const pane = document.querySelector('[data-testid="chat-detail-pane"]');
  const transcript = document.querySelector('[data-testid="chat-transcript-region"]');
  const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
  const composer = document.querySelector('[data-testid="chat-composer"]');
  return {
    activeRunStatus: pane?.getAttribute("data-run-status") ?? "",
    at: timestamp(),
    chatDetailPane: elementRect(pane),
    composer: elementRect(composer),
    queueSize: document.querySelectorAll('[data-testid="chat-queued-turn-row"]').length,
    selectedConversationId: pane?.getAttribute("data-conversation-id") ?? "",
    transcript: scrollRect(transcript, scroller),
    trigger,
    type: "layout_snapshot",
    url: window.location.href,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
    visibleTurnIds: Array.from(document.querySelectorAll('[data-testid="chat-transcript-turn"]'))
      .map((turn) => turn.getAttribute("data-run-id") ?? "")
      .filter((id) => id !== ""),
  };
}

function elementRect(element: Element | null) {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return {
    bottom: round(rect.bottom),
    height: round(rect.height),
    left: round(rect.left),
    right: round(rect.right),
    top: round(rect.top),
    width: round(rect.width),
  };
}

function scrollRect(region: Element | null, scroller: Element | null) {
  const rect = elementRect(region);
  if (!rect || !region) {
    return null;
  }
  return {
    ...rect,
    clientHeight: scroller?.clientHeight ?? region.clientHeight,
    scrollHeight: scroller?.scrollHeight ?? region.scrollHeight,
  };
}

function summarizeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const element = closestUsefulElement(target);
  return {
    ariaLabel: truncate(element.getAttribute("aria-label") ?? ""),
    classes: truncate(className(element)),
    id: truncate(element.id),
    name: truncate(element.getAttribute("name") ?? ""),
    role: truncate(element.getAttribute("role") ?? ""),
    tag: element.tagName.toLowerCase(),
    text: truncate(textContent(element)),
    type: truncate(element.getAttribute("type") ?? ""),
  };
}

function closestUsefulElement(element: Element): Element {
  return (
    element.closest("button,a,input,textarea,select,[role],[data-testid],[aria-label]") ?? element
  );
}

function className(element: Element): string {
  if (typeof element.className === "string") {
    return element.className;
  }
  return "";
}

interface RecordedText {
  length: number;
  truncated: boolean;
  value: string;
}

function textContent(element: Element): string {
  return recordableElementText(element).value;
}

function recordableElementText(element: Element): RecordedText {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return recordableString("");
  }
  const parts: string[] = [];
  let length = 0;
  let truncated = false;
  const append = (value: string) => {
    if (truncated) {
      return;
    }
    const remaining = maxRecordedTextLength - length;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const codePoints = Array.from(value);
    if (codePoints.length > remaining) {
      parts.push(codePoints.slice(0, remaining).join(""));
      length += remaining;
      truncated = true;
      return;
    }
    parts.push(value);
    length += codePoints.length;
  };
  const walk = (node: Node) => {
    if (truncated) {
      return;
    }
    if (node instanceof Element && node.matches(volatileRecordedTextSelector)) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent ?? "");
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(element);
  return recordableString(parts.join("").replace(/\s+/g, " ").trim(), truncated);
}

function recordableString(value: string, alreadyTruncated = false): RecordedText {
  const codePoints = Array.from(value);
  if (codePoints.length <= maxRecordedTextLength) {
    return {
      length: codePoints.length,
      truncated: alreadyTruncated,
      value,
    };
  }
  return {
    length: maxRecordedTextLength,
    truncated: true,
    value: codePoints.slice(0, maxRecordedTextLength).join(""),
  };
}

function timestamp(): string {
  return new Date().toISOString();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function truncate(value: string): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= maxTextLength) {
    return value;
  }
  return (
    codePoints
      .slice(0, maxTextLength - 3)
      .join("")
      .trimEnd() + "..."
  );
}

function layoutSnapshotTrigger(event: Event): string {
  if (!(event instanceof CustomEvent)) {
    return "manual";
  }
  const detail = event.detail;
  if (typeof detail !== "object" || detail === null || !("trigger" in detail)) {
    return "manual";
  }
  return typeof detail.trigger === "string" && detail.trigger !== "" ? detail.trigger : "manual";
}
