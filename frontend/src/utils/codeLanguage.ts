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
  if (normalized.endsWith(".py")) {
    return CodeLanguageEnum.python;
  }
  if (normalized.endsWith(".sh") || normalized.endsWith(".bash")) {
    return CodeLanguageEnum.bash;
  }
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) {
    return CodeLanguageEnum.typescript;
  }
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".mjs")
  ) {
    return CodeLanguageEnum.javascript;
  }
  if (normalized.endsWith(".json")) {
    return CodeLanguageEnum.json;
  }
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
    return CodeLanguageEnum.yaml;
  }
  if (normalized.endsWith(".toml")) {
    return CodeLanguageEnum.toml;
  }
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return CodeLanguageEnum.markdown;
  }
  return CodeLanguageEnum.plaintext;
}
