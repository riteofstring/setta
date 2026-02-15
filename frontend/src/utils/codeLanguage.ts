import { CodeLanguageEnum, ObjectValues } from "utils/generatedTypes";

export type CodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

const RUNNABLE_CODE_LANGUAGES = new Set<CodeLanguage>([
  CodeLanguageEnum.python,
  CodeLanguageEnum.bash,
]);

export function isRunnableCodeLanguage(language: CodeLanguage): boolean {
  return RUNNABLE_CODE_LANGUAGES.has(language);
}

export function resolveCodeLanguageFromPath(path: string): CodeLanguage {
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
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return CodeLanguageEnum.markdown;
  }
  return CodeLanguageEnum.plaintext;
}
