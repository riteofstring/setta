export type ManyMarkdownType = Record<string, string>;

export type MarkdownStateType = { x: ManyMarkdownType };

export type MarkdownActionType = {
  resetAndSetAll: (payload: ManyMarkdownType) => void;
  setMarkdown: (payload: { sectionId: string; value: string }) => void;
  setAll: (payload: ManyMarkdownType) => void;
  reset: () => void;
};

export type MarkdownZustandType = MarkdownStateType & MarkdownActionType;
