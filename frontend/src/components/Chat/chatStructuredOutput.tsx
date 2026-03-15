import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import {
  memo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { normalizeToolName } from "utils/claudeTools";
import {
  type CodeLanguage,
  resolveCodeLanguageFromPath,
} from "utils/codeLanguage";
import { CodeLanguageEnum, type ToolChatMessage } from "utils/generatedTypes";
import {
  formatToolArgs,
  isRecord,
  type ToolResultValue,
} from "./chatAssistantActivity";
import { useTypewriterEffect } from "./useTypewriterEffect";

export type StructuredOutputOwner = "action" | "tool" | "terminal" | "subagent";
export type StructuredOutputRunState =
  | "running"
  | "success"
  | "failed"
  | "stopped";
type StructuredOutputKind = "plain" | "code" | "diff";

export type StructuredOutputPayload = {
  text: string;
  kind: StructuredOutputKind;
  language: CodeLanguage | null;
  useJsx: boolean;
  pathHint: string | null;
};

export type StructuredOutputPart = "input" | "output";

const STRUCTURED_OUTPUT_DEFAULT_MAX_HEIGHT_PX = 260;
const STRUCTURED_OUTPUT_MIN_HEIGHT_PX = 90;
const STRUCTURED_OUTPUT_MAX_VIEWPORT_RATIO = 0.8;
const STRUCTURED_OUTPUT_RESIZE_HANDLE_CLASS =
  "group/resize absolute inset-x-0 bottom-0 z-[1] h-3 translate-y-1/2 cursor-row-resize touch-none opacity-0 transition-opacity data-[resizing=true]:opacity-100 group-hover/structured-output-pane:opacity-100 group-focus-within/structured-output-pane:opacity-100";
const STRUCTURED_OUTPUT_RESIZE_HANDLE_BAR_CLASS =
  "absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-setta-200/90 transition-colors group-hover/resize:bg-blue-400 group-focus-visible/resize:bg-blue-400 dark:bg-setta-700/90 dark:group-hover/resize:bg-blue-400 dark:group-focus-visible/resize:bg-blue-400";

function resolveCodeLanguageFromMimeType(mimeType: string | null): {
  language: CodeLanguage | null;
  useJsx: boolean;
} {
  if (!mimeType) {
    return { language: null, useJsx: false };
  }
  const normalized = mimeType.trim().toLowerCase();
  if (
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized === "text/json"
  ) {
    return { language: CodeLanguageEnum.json, useJsx: false };
  }
  if (
    normalized === "application/yaml" ||
    normalized === "text/yaml" ||
    normalized === "application/x-yaml" ||
    normalized === "text/x-yaml"
  ) {
    return { language: CodeLanguageEnum.yaml, useJsx: false };
  }
  if (normalized === "text/markdown") {
    return { language: CodeLanguageEnum.markdown, useJsx: false };
  }
  if (
    normalized === "application/toml" ||
    normalized === "text/x-toml" ||
    normalized === "application/x-toml"
  ) {
    return { language: CodeLanguageEnum.toml, useJsx: false };
  }
  if (
    normalized === "application/javascript" ||
    normalized === "text/javascript" ||
    normalized === "application/x-javascript"
  ) {
    return { language: CodeLanguageEnum.javascript, useJsx: false };
  }
  if (
    normalized === "application/typescript" ||
    normalized === "text/typescript"
  ) {
    return { language: CodeLanguageEnum.typescript, useJsx: false };
  }
  return { language: null, useJsx: false };
}

function resolveLanguageFromPathHint(pathHint: string | null): {
  language: CodeLanguage | null;
  useJsx: boolean;
} {
  if (!pathHint) {
    return { language: null, useJsx: false };
  }
  const normalized = pathHint.toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return { language: CodeLanguageEnum.typescript, useJsx: true };
  }
  if (normalized.endsWith(".jsx")) {
    return { language: CodeLanguageEnum.javascript, useJsx: true };
  }
  const language = resolveCodeLanguageFromPath(pathHint);
  if (language === CodeLanguageEnum.plaintext) {
    return { language: null, useJsx: false };
  }
  return { language, useJsx: false };
}

function resolvePathHintFromUnknown(value: unknown): string | null {
  const pathKeys = [
    "path",
    "filePath",
    "filepath",
    "targetPath",
    "target",
    "file",
    "filename",
    "fileName",
    "uri",
  ];
  for (const key of pathKeys) {
    const resolved = resolveNonEmptyStringField(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolveMimeTypeHintFromUnknown(value: unknown): string | null {
  const mimeKeys = ["mimeType", "mimetype", "contentType", "content_type"];
  for (const key of mimeKeys) {
    const resolved = resolveNonEmptyStringField(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolveCommandInputText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const command = value.command;
  if (typeof command !== "string") {
    return null;
  }
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return command;
}

export function resolveDiffTextFromUnknown(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const diff = value.diff;
  if (typeof diff !== "string") {
    return null;
  }
  const trimmed = diff.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return diff;
}

function resolveNonEmptyStringField(
  value: unknown,
  key: string,
): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const fieldValue = value[key];
  if (typeof fieldValue !== "string") {
    return null;
  }
  const trimmed = fieldValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function classifyDiffLineForChat(
  line: string,
): "add" | "del" | "hunk" | "file" | "meta" | "context" {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("diff --git")) {
    return "meta";
  }
  if (
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("\\ No newline at end of file")
  ) {
    return "meta";
  }
  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "file";
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "add";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "del";
  }
  return "context";
}

export function isUnifiedDiffText(text: string): boolean {
  const lines = text.split(/\r?\n/u);
  let hasFileHeader = false;
  let hasHunk = false;
  let hasDiffHeader = false;
  let hasBinaryHeader = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      hasDiffHeader = true;
    } else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      hasFileHeader = true;
    } else if (line.startsWith("@@")) {
      hasHunk = true;
    } else if (line.startsWith("Binary files ")) {
      hasBinaryHeader = true;
    }
  }
  if (hasDiffHeader && (hasFileHeader || hasHunk || hasBinaryHeader)) {
    return true;
  }
  if (hasFileHeader && hasHunk) {
    return true;
  }
  return false;
}

function tryParseObjectOrArrayJson(text: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) || isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveStructuredOutputPayload({
  value,
  toolName,
  part,
  contextValue,
}: {
  value: unknown;
  toolName: string;
  part: StructuredOutputPart;
  contextValue?: unknown;
}): StructuredOutputPayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalizedToolName = normalizeToolName(toolName) ?? toolName;
  const pathHint =
    resolvePathHintFromUnknown(value) ??
    resolvePathHintFromUnknown(contextValue) ??
    null;
  const mimeTypeHint =
    resolveMimeTypeHintFromUnknown(value) ??
    resolveMimeTypeHintFromUnknown(contextValue) ??
    null;
  const pathLanguage = resolveLanguageFromPathHint(pathHint);
  const mimeLanguage = resolveCodeLanguageFromMimeType(mimeTypeHint);
  const resolvedLanguage =
    pathLanguage.language !== null ? pathLanguage : mimeLanguage;

  if (normalizedToolName === "file_change") {
    const diffFromObject = resolveDiffTextFromUnknown(value);
    if (diffFromObject && isUnifiedDiffText(diffFromObject)) {
      return {
        text: diffFromObject,
        kind: "diff",
        language: null,
        useJsx: false,
        pathHint,
      };
    }
  }

  if (part === "input" && normalizedToolName === "command_execution") {
    const commandText = resolveCommandInputText(value);
    if (commandText) {
      return {
        text: commandText,
        kind: "code",
        language: CodeLanguageEnum.bash,
        useJsx: false,
        pathHint,
      };
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (isUnifiedDiffText(value)) {
      return {
        text: value,
        kind: "diff",
        language: null,
        useJsx: false,
        pathHint,
      };
    }
    const parsedJson = tryParseObjectOrArrayJson(value);
    if (parsedJson !== null) {
      return {
        text: JSON.stringify(parsedJson, null, 2),
        kind: "code",
        language: CodeLanguageEnum.json,
        useJsx: false,
        pathHint,
      };
    }
    if (resolvedLanguage.language !== null) {
      return {
        text: value,
        kind: "code",
        language: resolvedLanguage.language,
        useJsx: resolvedLanguage.useJsx,
        pathHint,
      };
    }
    return {
      text: value,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint,
    };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return {
      text: String(value),
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint,
    };
  }

  if (Array.isArray(value) || isRecord(value)) {
    return {
      text: formatToolArgs(value),
      kind: "code",
      language: CodeLanguageEnum.json,
      useJsx: false,
      pathHint,
    };
  }

  return {
    text: String(value),
    kind: "plain",
    language: null,
    useJsx: false,
    pathHint,
  };
}

export function resolveStructuredOutputFallbackPayload({
  runState,
  failedLabel,
  successLabel,
  stoppedLabel,
}: {
  runState: StructuredOutputRunState;
  failedLabel: string;
  successLabel: string;
  stoppedLabel: string;
}): StructuredOutputPayload | null {
  if (runState === "failed") {
    return {
      text: failedLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  if (runState === "success") {
    return {
      text: successLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  if (runState === "stopped") {
    return {
      text: stoppedLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  return null;
}

type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;
type StructuredOutputResizeEdge = "top" | "bottom";

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function attachStructuredOutputResizeListeners({
  target,
  onMove,
  onUp,
}: {
  target: ResizeListenerTarget;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
}): () => void {
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
}

function findNearestVerticalScrollContainer(
  element: HTMLElement,
): HTMLElement | null {
  const messageListScrollContainer = element.closest<HTMLElement>(
    '[data-chat-message-list-scroll-container="true"]',
  );
  if (messageListScrollContainer) {
    return messageListScrollContainer;
  }
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function resolveTopDeltaPerScrollPixel({
  scrollContainer,
  probeElement,
}: {
  scrollContainer: HTMLElement;
  probeElement: HTMLElement;
}): number {
  const originalScrollTop = scrollContainer.scrollTop;
  const initialTop = probeElement.getBoundingClientRect().top;
  for (const desiredOffset of [1, -1]) {
    scrollContainer.scrollTop = originalScrollTop + desiredOffset;
    const actualOffset = scrollContainer.scrollTop - originalScrollTop;
    const nextTop = probeElement.getBoundingClientRect().top;
    scrollContainer.scrollTop = originalScrollTop;
    if (Math.abs(actualOffset) < 0.5) {
      continue;
    }
    const topDeltaPerScrollPixel = (nextTop - initialTop) / actualOffset;
    if (Math.abs(topDeltaPerScrollPixel) > 0.01) {
      return topDeltaPerScrollPixel;
    }
  }
  return 0;
}

const StructuredOutputViewport = memo(function StructuredOutputViewport({
  owner,
  part,
  children,
}: {
  owner: StructuredOutputOwner;
  part: StructuredOutputPart;
  children: ReactNode;
}) {
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  const beginResize = useCallback(
    (
      edge: StructuredOutputResizeEdge,
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const contentElement = contentRef.current;
      if (!contentElement) {
        return;
      }
      const startHeightPx = contentElement.getBoundingClientRect().height;
      const startPointerY = event.clientY;
      const pointerId = event.pointerId;
      setIsResizing(true);
      const minHeightPx = Math.min(
        STRUCTURED_OUTPUT_MIN_HEIGHT_PX,
        startHeightPx,
      );
      const maxHeightPx = Math.max(
        STRUCTURED_OUTPUT_MIN_HEIGHT_PX,
        Math.floor(window.innerHeight * STRUCTURED_OUTPUT_MAX_VIEWPORT_RATIO),
      );
      let previousHeightPx = startHeightPx;
      const scrollContainer =
        edge === "bottom"
          ? findNearestVerticalScrollContainer(contentElement)
          : null;
      const topDeltaPerScrollPixel =
        scrollContainer !== null
          ? resolveTopDeltaPerScrollPixel({
              scrollContainer,
              probeElement: contentElement,
            })
          : 0;

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const pointerDeltaY = moveEvent.clientY - startPointerY;
        const signedDeltaY = edge === "top" ? -pointerDeltaY : pointerDeltaY;
        const nextHeight = clampValue(
          startHeightPx + signedDeltaY,
          minHeightPx,
          maxHeightPx,
        );
        if (nextHeight === previousHeightPx) {
          return;
        }
        const previousTopPx = contentElement.getBoundingClientRect().top;
        const isBottomGrowth =
          edge === "bottom" && nextHeight > previousHeightPx;
        previousHeightPx = nextHeight;
        setHeightPx(nextHeight);

        if (isBottomGrowth && scrollContainer) {
          if (resizeFrameRef.current !== null) {
            window.cancelAnimationFrame(resizeFrameRef.current);
          }
          resizeFrameRef.current = window.requestAnimationFrame(() => {
            resizeFrameRef.current = null;
            const nextTopPx = contentElement.getBoundingClientRect().top;
            const topShiftPx = nextTopPx - previousTopPx;
            if (
              Math.abs(topShiftPx) > 0.5 &&
              Math.abs(topDeltaPerScrollPixel) > 0.01
            ) {
              scrollContainer.scrollTop += -topShiftPx / topDeltaPerScrollPixel;
            }
          });
        }
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
        resizeCleanupRef.current = null;
        setIsResizing(false);
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
      };

      resizeCleanupRef.current?.();
      const cleanup = attachStructuredOutputResizeListeners({
        target: window,
        onMove,
        onUp,
      });
      resizeCleanupRef.current = cleanup;
    },
    [],
  );

  const contentStyle =
    heightPx === null
      ? { maxHeight: `${STRUCTURED_OUTPUT_DEFAULT_MAX_HEIGHT_PX}px` }
      : { height: `${heightPx}px` };

  return (
    <div className="group/structured-output-pane relative min-w-0">
      <div
        ref={contentRef}
        data-chat-structured-output-pane="true"
        data-chat-structured-output-pane-owner={owner}
        data-chat-structured-output-pane-part={part}
        className="min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
        style={contentStyle}
      >
        {children}
      </div>
      {(["bottom"] as const).map((edge) => (
        <div
          key={edge}
          role="separator"
          aria-label={`Resize activity output pane from ${edge} border`}
          data-chat-structured-output-resize-handle="true"
          data-chat-structured-output-resize-handle-owner={owner}
          data-chat-structured-output-resize-handle-part={part}
          data-chat-structured-output-resize-handle-edge={edge}
          data-resizing={isResizing ? "true" : "false"}
          className={STRUCTURED_OUTPUT_RESIZE_HANDLE_CLASS}
          onPointerDown={(event) => beginResize(edge, event)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setHeightPx(null);
          }}
        >
          <div
            className={STRUCTURED_OUTPUT_RESIZE_HANDLE_BAR_CLASS}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
});

export const StructuredOutputBlock = memo(function StructuredOutputBlock({
  payload,
  owner,
  part,
  isStreaming,
}: {
  payload: StructuredOutputPayload;
  owner: StructuredOutputOwner;
  part: StructuredOutputPart;
  isStreaming: boolean;
}) {
  const codeMirrorTheme = useCodeMirrorStyle();
  const displayText = useTypewriterEffect(payload.text, isStreaming, 5);
  let content: ReactNode;

  if (isStreaming) {
    content = (
      <pre
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind={payload.kind}
        data-chat-structured-output-language={payload.language ?? "plaintext"}
        data-chat-structured-output-streaming="true"
        className="m-0 cursor-auto overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
      >
        {displayText.length > 0 ? displayText : " "}
      </pre>
    );
  } else if (payload.kind === "diff") {
    content = (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="diff"
        data-chat-structured-output-language="diff"
        className="m-0 min-w-0 cursor-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
      >
        <GitDiffCodeMirror
          value={displayText}
          filePathForLanguage={payload.pathHint}
          wrapLines={true}
          className="min-h-0 w-full min-w-0 [&_.cm-content]:text-[11px] [&_.cm-content]:leading-[16px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
        />
      </div>
    );
  } else if (payload.kind === "code") {
    content = (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="code"
        data-chat-structured-output-language={payload.language ?? "plaintext"}
      >
        <DummyCodeMirror
          code={displayText}
          theme={codeMirrorTheme}
          className="cursor-auto overflow-x-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
          language={payload.language}
          useJsx={payload.useJsx}
          wrapLines={true}
        />
      </div>
    );
  } else {
    content = (
      <div
        data-chat-structured-output="true"
        data-chat-structured-output-owner={owner}
        data-chat-structured-output-part={part}
        data-chat-structured-output-kind="plain"
        data-chat-structured-output-language="plaintext"
      >
        <DummyCodeMirror
          code={displayText}
          theme={codeMirrorTheme}
          className="cursor-auto overflow-x-auto font-mono text-[11px] leading-relaxed text-setta-600 dark:text-setta-200"
          language={payload.language}
          useJsx={payload.useJsx}
          wrapLines={true}
        />
      </div>
    );
  }

  return (
    <StructuredOutputViewport owner={owner} part={part}>
      {content}
    </StructuredOutputViewport>
  );
});

export function formatStructuredToolResult(
  toolResult: ToolChatMessage | undefined,
): ToolResultValue | undefined {
  if (!toolResult) {
    return undefined;
  }
  if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
    const renderedEntries = toolResult.content
      .map((entry) => {
        if (entry.type === "text") {
          return entry.text;
        }
        if (entry.type === "tool_reference") {
          return `Tool reference: ${entry.tool_name}`;
        }
        if (entry.type === "resource") {
          const label = entry.resource?.uri
            ? `Resource: ${entry.resource.uri}`
            : "Resource";
          return entry.resource?.mimeType
            ? `${label} (${entry.resource.mimeType})`
            : label;
        }
        if (entry.type === "image") {
          return entry.mimeType ? `Image (${entry.mimeType})` : "Image";
        }
        return JSON.stringify(entry, null, 2);
      })
      .filter((entry) => entry.trim().length > 0);
    if (renderedEntries.length > 0) {
      return renderedEntries.join("\n\n");
    }
  }
  return toolResult.result;
}
