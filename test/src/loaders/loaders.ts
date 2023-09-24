import _ from "lodash";
import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "./constants";

export async function loadTestData({ projectName, configName }) {
  // cloning avoids weird downstream mutation bugs that I don't fully understand...
  return _.cloneDeep(await _loadTestData({ projectName, configName }));
}

async function _loadTestData({ projectName, configName }) {
  const x = await loadSpecificTestData({ projectName, name: "Project" });
  const { configs, ...output } = x;
  const config = configs.find((c) => c.projectConfig.name === configName);
  const finalOutput = { project: output, ...config };
  finalOutput["uiTypes"] = {
    ...finalOutput["uiTypes"],
    ...(await loadSpecificTestData({ name: "PresetUITypes" })),
  };
  return finalOutput;
}

export async function loadAllProjects() {
  const output: any[] = [];
  for (const p of PROJECT_NAMES) {
    for (const configName of PROJECT_CONFIG_NAMES[p]) {
      output.push(
        await loadTestData({
          projectName: p,
          configName,
        })
      );
    }
  }
  return output;
}

export async function loadSpecificTestData({ name, projectName = "" }) {
  const ext = ".ts";

  try {
    const output = (
      await import(/* @vite-ignore */ `../data/${projectName}/${name}${ext}`)
    ).default;
    return output;
  } catch (e) {
    return {};
  }
}
