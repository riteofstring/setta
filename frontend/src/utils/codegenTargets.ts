import {
  ProjectCodegenLanguageEnum,
  ProjectCodegenPythonTarget,
  ProjectConfig,
} from "utils/generatedTypes";

export function getPythonCodegenTarget(
  config: ProjectConfig,
): ProjectCodegenPythonTarget | null {
  const match = config.codegenTargets.find(
    (target) => target.language === ProjectCodegenLanguageEnum.python,
  );
  return match ?? null;
}

export function projectConfigHasPythonCodegen(config: ProjectConfig): boolean {
  return getPythonCodegenTarget(config) !== null;
}
