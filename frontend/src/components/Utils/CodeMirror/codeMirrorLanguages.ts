import {
  javascript,
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage,
} from "@codemirror/lang-javascript";
import { json, jsonLanguage } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { python, pythonLanguage } from "@codemirror/lang-python";
import { yaml, yamlLanguage } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import type { Extension } from "@codemirror/state";
import {
  resolveCodeLanguageFromPath,
  type CodeLanguage,
} from "utils/codeLanguage";

const TOML_LANGUAGE = StreamLanguage.define(tomlMode);

export type CodeMirrorParserLike = {
  parse: (input: string) => unknown;
};

export function getCodeMirrorLanguageExtensions(
  language: CodeLanguage | null | undefined,
  useJsx: boolean,
): Array<Extension> {
  if (language === "python") {
    return [python()];
  }
  if (language === "typescript") {
    return [javascript({ typescript: true, jsx: useJsx })];
  }
  if (language === "javascript") {
    return [javascript({ jsx: useJsx })];
  }
  if (language === "json") {
    return [json()];
  }
  if (language === "yaml") {
    return [yaml()];
  }
  if (language === "toml") {
    return [TOML_LANGUAGE];
  }
  if (language === "markdown") {
    return [markdown()];
  }
  return [];
}

export function getCodeMirrorLanguageParser(
  language: CodeLanguage | null | undefined,
  useJsx: boolean,
): CodeMirrorParserLike | null {
  if (language === "python") {
    return pythonLanguage.parser;
  }
  if (language === "typescript") {
    return useJsx ? tsxLanguage.parser : typescriptLanguage.parser;
  }
  if (language === "javascript") {
    return useJsx ? jsxLanguage.parser : javascriptLanguage.parser;
  }
  if (language === "json") {
    return jsonLanguage.parser;
  }
  if (language === "yaml") {
    return yamlLanguage.parser;
  }
  if (language === "toml") {
    return TOML_LANGUAGE.parser;
  }
  if (language === "markdown") {
    return markdownLanguage.parser;
  }
  return null;
}

export function getCodeMirrorLanguageParserForPath(
  path: string | null | undefined,
): CodeMirrorParserLike | null {
  if (!path) {
    return null;
  }
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return tsxLanguage.parser;
  }
  if (normalized.endsWith(".jsx")) {
    return jsxLanguage.parser;
  }
  if (normalized.endsWith(".cjs")) {
    return javascriptLanguage.parser;
  }
  const language = resolveCodeLanguageFromPath(path);
  return getCodeMirrorLanguageParser(language, false);
}
