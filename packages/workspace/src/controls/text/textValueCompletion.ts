export type TextValueCompletionRequest = {
  value: string;

  cursorOffset: number;
  explicit: boolean;
  signal: AbortSignal;
};

export type TextValueCompletionOption = {
  label: string;
  insertText?: string;
};

export type TextValueCompletionResult = {
  from: number;
  to?: number;
  options: readonly TextValueCompletionOption[];
};

export type TextValueCompletionProvider = (
  request: TextValueCompletionRequest,
) => Promise<TextValueCompletionResult | null>;
