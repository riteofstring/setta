import { CodeLanguageEnum } from "utils/generatedTypes";

type BuiltinCodeLanguage =
  (typeof CodeLanguageEnum)[keyof typeof CodeLanguageEnum];
declare const pluginCodeLanguageBrand: unique symbol;
type PluginCodeLanguage = string & {
  readonly [pluginCodeLanguageBrand]: "PluginCodeLanguage";
};
export type CodeLanguage = BuiltinCodeLanguage | PluginCodeLanguage;

const BUILTIN_CODE_LANGUAGES = new Set<BuiltinCodeLanguage>(
  Object.values(CodeLanguageEnum),
);

const FILE_EXTENSION_LANGUAGES: ReadonlyArray<
  readonly [ReadonlyArray<string>, BuiltinCodeLanguage]
> = [
  [[".py"], CodeLanguageEnum.python],
  [[".sh", ".bash"], CodeLanguageEnum.bash],
  [[".ts", ".tsx"], CodeLanguageEnum.typescript],
  [[".js", ".jsx", ".mjs"], CodeLanguageEnum.javascript],
  [[".json"], CodeLanguageEnum.json],
  [[".yaml", ".yml"], CodeLanguageEnum.yaml],
  [[".toml"], CodeLanguageEnum.toml],
  [[".md", ".markdown"], CodeLanguageEnum.markdown],
];

export function toCodeLanguage(language: string): CodeLanguage {
  if (isBuiltinCodeLanguage(language)) {
    return language;
  }
  return language as PluginCodeLanguage;
}

export function isBuiltinCodeLanguage(
  language: string,
): language is BuiltinCodeLanguage {
  return BUILTIN_CODE_LANGUAGES.has(language as BuiltinCodeLanguage);
}

export function resolveCodeLanguageFromPath(path: string): BuiltinCodeLanguage {
  const normalized = path.toLowerCase();
  const match = FILE_EXTENSION_LANGUAGES.find(([extensions]) =>
    extensions.some((extension) => normalized.endsWith(extension)),
  );
  return match?.[1] ?? CodeLanguageEnum.plaintext;
}
