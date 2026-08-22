import type {
  WorkspaceCodeSectionCompletionProvider,
  WorkspaceCodeSectionCompletionResult,
} from "@setta/workspace";

import { ProjectClientError, completePythonTarget } from "../backend/client";
import { callableIdentifierSegmentBounds } from "./callableCompletion";

type PythonTargetCompletionProviderOptions = {
  fetchImplementation?: typeof fetch;
  onFailure: (message: string) => void;
  onSuccess: () => void;
  projectId: string;
};

// This provider is registered only on Python Canvas's generated Python Code section. The workspace
// gives it the current live generated range, so the split is positional and never guesses by
// searching for generated text that might also appear in authored Python.
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
    if (language !== "python" || generatedRegion === null) {
      return null;
    }
    const target = targetCompletionContext(
      text,
      generatedRegion,
      cursorOffsetUtf16,
    );
    if (target === null) {
      return null;
    }

    try {
      const bounds = callableIdentifierSegmentBounds(
        target.localText,
        target.localCursorOffsetUtf16,
      );
      const { items } = await completePythonTarget(
        {
          cursorOffsetUtf16: target.localCursorOffsetUtf16,
          prefix: target.prefix,
          projectId,
          region: target.region,
          suffix: target.suffix,
        },
        signal,
        fetchImplementation,
      );
      if (signal.aborted) {
        return null;
      }
      onSuccess();
      return completionResult(target.offset, bounds, items);
    } catch (error) {
      if (!signal.aborted) {
        onFailure(pythonTargetCompletionFailureMessage(error));
      }
      return null;
    }
  };
}

type TargetCompletionContext = Readonly<{
  localCursorOffsetUtf16: number;
  localText: string;
  offset: number;
  prefix: string;
  region: "prefix" | "suffix";
  suffix: string;
}>;

function targetCompletionContext(
  text: string,
  generatedRegion: { from: number; to: number },
  cursorOffsetUtf16: number,
): TargetCompletionContext | null {
  if (
    !Number.isSafeInteger(generatedRegion.from) ||
    !Number.isSafeInteger(generatedRegion.to) ||
    generatedRegion.from < 0 ||
    generatedRegion.to < generatedRegion.from ||
    generatedRegion.to > text.length ||
    !Number.isSafeInteger(cursorOffsetUtf16) ||
    cursorOffsetUtf16 < 0 ||
    cursorOffsetUtf16 > text.length
  ) {
    return null;
  }
  // The provider observes the same boundary contract as the workspace adapter: positions strictly
  // inside the generated interval are protected, while a caret at either edge belongs to the
  // authored region on that side.
  if (
    cursorOffsetUtf16 > generatedRegion.from &&
    cursorOffsetUtf16 < generatedRegion.to
  ) {
    return null;
  }
  const prefix = text.slice(0, generatedRegion.from);
  const suffix = text.slice(generatedRegion.to);
  if (cursorOffsetUtf16 <= generatedRegion.from) {
    return {
      localCursorOffsetUtf16: cursorOffsetUtf16,
      localText: prefix,
      offset: 0,
      prefix,
      region: "prefix",
      suffix,
    };
  }
  return {
    localCursorOffsetUtf16: cursorOffsetUtf16 - generatedRegion.to,
    localText: suffix,
    offset: generatedRegion.to,
    prefix,
    region: "suffix",
    suffix,
  };
}

function completionResult(
  offset: number,
  bounds: { from: number; to: number },
  items: ReadonlyArray<{ label: string; insertText: string }>,
): WorkspaceCodeSectionCompletionResult {
  return {
    from: offset + bounds.from,
    options: items.map((item) => ({
      insertText: item.insertText,
      label: item.label,
    })),
    to: offset + bounds.to,
  };
}

function pythonTargetCompletionFailureMessage(error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to load Python target completions. ${error.message}`;
  }
  return "Unable to load Python target completions. Try again.";
}
