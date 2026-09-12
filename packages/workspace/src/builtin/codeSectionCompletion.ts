import type {
  WorkspaceCodeSectionLanguage,
  WorkspaceGeneratedRegion,
} from "./codeSectionData";

export type WorkspaceCodeSectionCompletionRequest = Readonly<{
  sectionId: string;
  text: string;

  cursorOffsetUtf16: number;
  trigger: "explicit" | "typing";
  language: WorkspaceCodeSectionLanguage;
  generatedRegion: WorkspaceGeneratedRegion | null;
  signal: AbortSignal;
}>;

export type WorkspaceCodeSectionCompletionOption = Readonly<{
  label: string;
  insertText: string;
}>;

export type WorkspaceCodeSectionCompletionResult = Readonly<{
  from: number;
  to: number;
  options: readonly WorkspaceCodeSectionCompletionOption[];
}>;

export type WorkspaceCodeSectionCompletionProvider = (
  request: WorkspaceCodeSectionCompletionRequest,
) => Promise<WorkspaceCodeSectionCompletionResult | null>;
