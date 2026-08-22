import type {
  WorkspaceCodeSectionLanguage,
  WorkspaceGeneratedRegion,
} from "./codeSectionData";

// Completion is a registration capability, not section data. A host may opt one Code section
// kind into a provider without making provider identity, request state, or an application error
// part of a serialized workspace document.
export type WorkspaceCodeSectionCompletionRequest = Readonly<{
  sectionId: string;
  text: string;
  // CodeMirror positions and JavaScript string offsets are UTF-16 code units.
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
