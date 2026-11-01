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
import type { WorkspaceEditorLanguage } from "./editorLanguages.js";

const TOML_LANGUAGE = StreamLanguage.define(tomlMode);
const SHELL_LANGUAGE = StreamLanguage.define(shellMode);

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
