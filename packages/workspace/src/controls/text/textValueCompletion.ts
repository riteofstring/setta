// Consumer-neutral completion vocabulary for the controlled text editor. Editor-engine details
// stay in the internal adapter so consumers only describe their value, cursor, and choices.
export type TextValueCompletionRequest = {
  value: string;
  // A JavaScript string (UTF-16) offset, matching the editor's document positions.
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
