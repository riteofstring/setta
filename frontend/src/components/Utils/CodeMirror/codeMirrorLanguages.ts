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

type CodeMirrorLanguageSupport = {
  getExtensions: (useJsx: boolean) => Array<Extension>;
  getParser: (useJsx: boolean) => CodeMirrorParserLike;
};

const CODE_MIRROR_LANGUAGE_SUPPORT: Record<string, CodeMirrorLanguageSupport> =
  {
    python: {
      getExtensions: () => [python()],
      getParser: () => pythonLanguage.parser,
    },
    typescript: {
      getExtensions: (useJsx) => [
        javascript({ typescript: true, jsx: useJsx }),
      ],
      getParser: (useJsx) =>
        useJsx ? tsxLanguage.parser : typescriptLanguage.parser,
    },
    javascript: {
      getExtensions: (useJsx) => [javascript({ jsx: useJsx })],
      getParser: (useJsx) =>
        useJsx ? jsxLanguage.parser : javascriptLanguage.parser,
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

const PATH_PARSER_OVERRIDES: ReadonlyArray<
  readonly [suffix: string, parser: CodeMirrorParserLike]
> = [
  [".tsx", tsxLanguage.parser],
  [".jsx", jsxLanguage.parser],
  [".cjs", javascriptLanguage.parser],
];

function getCodeMirrorLanguageSupport(
  language: CodeLanguage | null | undefined,
): CodeMirrorLanguageSupport | null {
  if (!language) {
    return null;
  }
  return CODE_MIRROR_LANGUAGE_SUPPORT[language] ?? null;
}

export function getCodeMirrorLanguageExtensions(
  language: CodeLanguage | null | undefined,
  useJsx: boolean,
): Array<Extension> {
  return getCodeMirrorLanguageSupport(language)?.getExtensions(useJsx) ?? [];
}

export function getCodeMirrorLanguageParser(
  language: CodeLanguage | null | undefined,
  useJsx: boolean,
): CodeMirrorParserLike | null {
  return getCodeMirrorLanguageSupport(language)?.getParser(useJsx) ?? null;
}

export function getCodeMirrorLanguageParserForPath(
  path: string | null | undefined,
): CodeMirrorParserLike | null {
  if (!path) {
    return null;
  }
  const normalized = path.toLowerCase();
  const override = PATH_PARSER_OVERRIDES.find(([suffix]) =>
    normalized.endsWith(suffix),
  );
  if (override) {
    return override[1];
  }
  const language = resolveCodeLanguageFromPath(path);
  return getCodeMirrorLanguageParser(language, false);
}
