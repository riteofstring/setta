import type {
  TextValueCompletionProvider,
  TextValueCompletionResult,
} from "@setta/workspace";

import { ProjectClientError, completeCallable } from "../backend/client";

type CallableIdentifierSegmentBounds = {
  from: number;
  to: number;
};

type CallableCompletionProviderOptions = {
  callableId: string;
  fetchImplementation?: typeof fetch;
  onFailure: (message: string) => void;
  onSuccess: () => void;
  projectId: string;
};

const identifierContinue = /^(?:\p{ID_Continue}|_)$/u;

export function createCallableCompletionProvider({
  callableId,
  fetchImplementation,
  onFailure,
  onSuccess,
  projectId,
}: CallableCompletionProviderOptions): TextValueCompletionProvider {
  return async ({ cursorOffset, signal, value }) => {
    if (value.trim() === "") {
      onSuccess();
      return null;
    }

    try {
      const bounds = callableIdentifierSegmentBounds(value, cursorOffset);
      const { items } = await completeCallable(
        callableId,
        {
          authoredExpression: value,
          cursorOffsetUtf16: cursorOffset,
          projectId,
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
        onFailure(callableCompletionFailureMessage(error));
      }
      return null;
    }
  };
}

export function callableIdentifierSegmentBounds(
  value: string,
  cursorOffset: number,
): CallableIdentifierSegmentBounds {
  assertUTF16Boundary(value, cursorOffset);
  let from = cursorOffset;
  while (from > 0) {
    const previous = codePointBefore(value, from);
    if (!isIdentifierContinuation(previous.value)) {
      break;
    }
    from = previous.start;
  }

  let to = cursorOffset;
  while (to < value.length) {
    const current = codePointAt(value, to);
    if (!isIdentifierContinuation(current.value)) {
      break;
    }
    to += current.width;
  }
  return { from, to };
}

function completionResult(
  bounds: CallableIdentifierSegmentBounds,
  items: ReadonlyArray<{ label: string; insertText: string }>,
): TextValueCompletionResult {
  return {
    ...bounds,
    options: items.map((item) => ({
      insertText: item.insertText,
      label: item.label,
    })),
  };
}

function callableCompletionFailureMessage(error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to load callable completions. ${error.message}`;
  }
  return "Unable to load callable completions. Try again.";
}

function assertUTF16Boundary(value: string, offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length) {
    throw new RangeError(
      "Callable completion cursor must be a JavaScript string offset.",
    );
  }
  if (
    offset > 0 &&
    offset < value.length &&
    isHighSurrogate(value.charCodeAt(offset - 1)) &&
    isLowSurrogate(value.charCodeAt(offset))
  ) {
    throw new RangeError(
      "Callable completion cursor cannot split a surrogate pair.",
    );
  }
}

function codePointBefore(
  value: string,
  end: number,
): { start: number; value: string } {
  const previous = value.charCodeAt(end - 1);
  if (
    isLowSurrogate(previous) &&
    end > 1 &&
    isHighSurrogate(value.charCodeAt(end - 2))
  ) {
    return { start: end - 2, value: value.slice(end - 2, end) };
  }
  return { start: end - 1, value: value.charAt(end - 1) };
}

function codePointAt(
  value: string,
  start: number,
): { value: string; width: number } {
  const current = value.charCodeAt(start);
  if (
    isHighSurrogate(current) &&
    start + 1 < value.length &&
    isLowSurrogate(value.charCodeAt(start + 1))
  ) {
    return { value: value.slice(start, start + 2), width: 2 };
  }
  return { value: value.charAt(start), width: 1 };
}

function isIdentifierContinuation(value: string): boolean {
  return identifierContinue.test(value);
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}
