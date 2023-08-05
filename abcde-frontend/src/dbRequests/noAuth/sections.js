import { loadSpecificTestData } from "abcde-test/src/loaders/helpers";
import { loadAllProjectMetadata } from "abcde-test/src/loaders/loaders";

export async function noAuthGetSections() {
  const projectMetadata = await loadAllProjectMetadata();
  const output = [];
  for (const p of Object.values(projectMetadata)) {
    for (const c of p.configs) {
      const sections = await loadSpecificTestData({
        projectName: p.name,
        configName: c.name,
        name: "Sections",
      });
      output.push({
        name: `${p.name}.${c.name}`,
        files: Object.values(sections)
          .map((s) => s.name)
          .slice(0, 5), //TODO get rid of this once there is a scrollbar in the file modal
      });
    }
  }
  return output;
}
