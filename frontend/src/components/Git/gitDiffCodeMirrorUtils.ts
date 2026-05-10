import {
  getCodeMirrorLanguageParserForPath,
  type CodeMirrorParserLike,
} from "components/Utils/CodeMirror/codeMirrorLanguages";

const DIFF_METADATA_PREFIXES = [
  "index ",
  "new file mode ",
  "deleted file mode ",
  "similarity index ",
  "rename from ",
  "rename to ",
  "\\ No newline at end of file",
] as const;

const DIFF_FILE_PREFIXES = ["+++ ", "--- "] as const;

type DiffLineAnalysis = {
  lineClass: string | null;
  shouldSyntaxHighlight: boolean;
};

const EMPTY_LINE_ANALYSIS: DiffLineAnalysis = {
  lineClass: null,
  shouldSyntaxHighlight: false,
};

function startsWithAny(text: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => text.startsWith(prefix));
}

function isDiffMetadataLine(text: string): boolean {
  return (
    text.startsWith("diff --git") || startsWithAny(text, DIFF_METADATA_PREFIXES)
  );
}

function isDiffFileLine(text: string): boolean {
  return startsWithAny(text, DIFF_FILE_PREFIXES);
}

function isDiffAdditionLine(text: string): boolean {
  return text.startsWith("+") && !text.startsWith("+++");
}

function isDiffDeletionLine(text: string): boolean {
  return text.startsWith("-") && !text.startsWith("---");
}

export function analyzeDiffLine(text: string): DiffLineAnalysis {
  if (!text) {
    return EMPTY_LINE_ANALYSIS;
  }
  if (text.startsWith("@@")) {
    return { lineClass: "cm-gitdiff-hunk", shouldSyntaxHighlight: false };
  }
  if (isDiffMetadataLine(text)) {
    return { lineClass: "cm-gitdiff-meta", shouldSyntaxHighlight: false };
  }
  if (isDiffFileLine(text)) {
    return { lineClass: "cm-gitdiff-file", shouldSyntaxHighlight: false };
  }
  if (isDiffAdditionLine(text)) {
    return { lineClass: "cm-gitdiff-add", shouldSyntaxHighlight: true };
  }
  if (isDiffDeletionLine(text)) {
    return { lineClass: "cm-gitdiff-del", shouldSyntaxHighlight: true };
  }
  return {
    lineClass: null,
    shouldSyntaxHighlight: text[0] === " ",
  };
}

export function parserForPath(
  path: string | null | undefined,
): CodeMirrorParserLike | null {
  return getCodeMirrorLanguageParserForPath(path);
}

export function shouldSyntaxHighlightLine(text: string): boolean {
  return analyzeDiffLine(text).shouldSyntaxHighlight;
}
