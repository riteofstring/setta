import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "../constants";
import { loadOneProject } from "../frontend/loaders";

export async function loadAllProjects({ forSavingToBackend = false }) {
  const output: any[] = [];
  for (const p of PROJECT_NAMES) {
    for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
      output.push(
        await loadOneProject({
          projectName: p,
          subFolderName,
          forSavingToBackend,
        })
      );
    }
  }
  return output;
}
