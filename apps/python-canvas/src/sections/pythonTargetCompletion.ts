import type {
  WorkspaceCodeSectionCompletionProvider,
  WorkspaceCodeSectionCompletionResult,
} from "@setta/workspace";

import { ProjectClientError, completePythonTarget } from "../api/client";
import { callableIdentifierSegmentBounds } from "./callableCompletion";

type PythonTargetCompletionProviderOptions = {
  fetchImplementation?: typeof fetch;
  onFailure: (message: string) => void;
  onSuccess: () => void;
  projectId: string;
};

export function createPythonTargetCompletionProvider({
  fetchImplementation,
  onFailure,
  onSuccess,
  projectId,
}: PythonTargetCompletionProviderOptions): WorkspaceCodeSectionCompletionProvider {
  return async ({
    cursorOffsetUtf16,
    generatedRegion,
    language,
    signal,
    text,
  }) => {
    if (
      language !== "python" ||
      generatedRegion === null ||
      !rangeIsWithinText(generatedRegion, text.length) ||
      !cursorIsWithinText(cursorOffsetUtf16, text.length) ||
      cursorIsInsideGeneratedRegion(cursorOffsetUtf16, generatedRegion)
    ) {
      return null;
    }

    try {
      const bounds = callableIdentifierSegmentBounds(text, cursorOffsetUtf16);
      const { items } = await completePythonTarget(
        {
          code: text,
          cursorOffsetUtf16,
          projectId,
          protectedBodyRange: {
            start: generatedRegion.from,
            end: generatedRegion.to,
          },
        },
        signal,
        fetchImplementation,
      );
      if (signal.aborted) {
        return null;
      }
      onSuccess();
      return completionResult(bounds, items);
    } catch (error) {
      if (!signal.aborted) {
        onFailure(pythonTargetCompletionFailureMessage(error));
      }
      return null;
    }
  };
}

function rangeIsWithinText(
  range: { from: number; to: number },
  textLength: number,
): boolean {
  return [
    Number.isSafeInteger(range.from),
    Number.isSafeInteger(range.to),
    range.from >= 0,
    range.to >= range.from,
    range.to <= textLength,
  ].every(Boolean);
}

function cursorIsWithinText(cursor: number, textLength: number): boolean {
  return Number.isSafeInteger(cursor) && cursor >= 0 && cursor <= textLength;
}

function cursorIsInsideGeneratedRegion(
  cursor: number,
  range: { from: number; to: number },
): boolean {
  return cursor >= range.from && cursor <= range.to;
}

function completionResult(
  bounds: { from: number; to: number },
  items: ReadonlyArray<{ label: string; insertText: string }>,
): WorkspaceCodeSectionCompletionResult {
  return {
    from: bounds.from,
    options: items.map((item) => ({
      insertText: item.insertText,
      label: item.label,
    })),
    to: bounds.to,
  };
}

function pythonTargetCompletionFailureMessage(error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to load Python target completions. ${error.message}`;
  }
  return "Unable to load Python target completions. Try again.";
}
