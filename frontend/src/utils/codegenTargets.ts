import {
  ProjectCodegenLanguageEnum,
  ProjectCodegenPluginTarget,
  ProjectCodegenPythonTarget,
  ProjectCodegenTarget,
  ProjectConfig,
} from "utils/generatedTypes";

function isPythonCodegenTarget(
  target: ProjectCodegenTarget,
): target is ProjectCodegenPythonTarget {
  return target.language === ProjectCodegenLanguageEnum.python;
}

function isPluginCodegenTarget(
  target: ProjectCodegenTarget,
): target is ProjectCodegenPluginTarget {
  return !isPythonCodegenTarget(target);
}

export function getPythonCodegenTarget(
  config: ProjectConfig,
): ProjectCodegenPythonTarget | null {
  const match = config.codegenTargets.find((target) =>
    isPythonCodegenTarget(target),
  );
  return match ?? null;
}

export function projectConfigHasPythonCodegen(config: ProjectConfig): boolean {
  return getPythonCodegenTarget(config) !== null;
}
