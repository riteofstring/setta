import {
  javascript,
  javascriptLanguage,
  typescriptLanguage,
} from "@codemirror/lang-javascript";
import { json, jsonLanguage } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { python, pythonLanguage } from "@codemirror/lang-python";
import { yaml, yamlLanguage } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import type { Extension } from "@codemirror/state";
import type { highlightTree } from "@lezer/highlight";

// The reference's `codeMirrorLanguages` registry trimmed to the host-declared value languages.
// The file-path resolution and the JSX/TSX parser variants serve application editors (Git
// diffs, code files) and stay application-side; the text value editor receives one declared
// language per control.

const TOML_LANGUAGE = StreamLanguage.define(tomlMode);
const SHELL_LANGUAGE = StreamLanguage.define(shellMode);

export type TextValueLanguage =
  | "python"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "toml"
  | "markdown";

// The built-in code section's editor vocabulary. The reference declares `bash` in its code
// language enum but registers no CodeMirror mode for it, so a bash code section renders
// unhighlighted there. Package-only design decision: bash highlights through the legacy shell
// stream mode from the already-pinned `@codemirror/legacy-modes`, the same package and shape
// the reference already uses for TOML. Item value controls keep their own narrower vocabulary.
export type WorkspaceEditorLanguage = TextValueLanguage | "bash";

// Structural stand-in for the reference's `CodeMirrorParserLike`: the tree type rides
// `highlightTree`'s own signature so the package declares no extra `@lezer` module.
export type TextValueParserLike = {
  parse: (input: string) => Parameters<typeof highlightTree>[0];
};

type TextValueLanguageSupport = {
  getExtensions: () => Array<Extension>;
  getParser: () => TextValueParserLike;
};

const TEXT_VALUE_LANGUAGE_SUPPORT: Record<
  WorkspaceEditorLanguage,
  TextValueLanguageSupport
> = {
  bash: {
    getExtensions: () => [SHELL_LANGUAGE],
    getParser: () => SHELL_LANGUAGE.parser,
  },
  python: {
    getExtensions: () => [python()],
    getParser: () => pythonLanguage.parser,
  },
  typescript: {
    getExtensions: () => [javascript({ typescript: true })],
    getParser: () => typescriptLanguage.parser,
  },
  javascript: {
    getExtensions: () => [javascript()],
    getParser: () => javascriptLanguage.parser,
  },
  json: {
    getExtensions: () => [json()],
    getParser: () => jsonLanguage.parser,
  },
  yaml: {
    getExtensions: () => [yaml()],
    getParser: () => yamlLanguage.parser,
  },
  toml: {
    getExtensions: () => [TOML_LANGUAGE],
    getParser: () => TOML_LANGUAGE.parser,
  },
  markdown: {
    getExtensions: () => [markdown()],
    getParser: () => markdownLanguage.parser,
  },
};

function getTextValueLanguageSupport(
  language: WorkspaceEditorLanguage | null | undefined,
): TextValueLanguageSupport | null {
  if (!language) {
    return null;
  }
  return TEXT_VALUE_LANGUAGE_SUPPORT[language];
}

export function getTextValueLanguageExtensions(
  language: WorkspaceEditorLanguage | null | undefined,
): Array<Extension> {
  return getTextValueLanguageSupport(language)?.getExtensions() ?? [];
}

export function getTextValueLanguageParser(
  language: WorkspaceEditorLanguage | null | undefined,
): TextValueParserLike | null {
  return getTextValueLanguageSupport(language)?.getParser() ?? null;
}
