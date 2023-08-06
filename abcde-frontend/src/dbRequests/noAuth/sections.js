import { loadSpecificTestData } from "abcde-test/src/loaders/helpers";
import { loadAllProjectMetadata } from "abcde-test/src/loaders/loaders";

export async function noAuthGetSections() {
  const projectMetadata = await loadAllProjectMetadata();
  const output = [];
  for (const p of Object.values(projectMetadata)) {
    output.push({ id: p.id, name: p.name, selectable: false, depth: 0 });
    for (const c of p.configs) {
      output.push({ id: c.id, name: c.name, selectable: false, depth: 1 });
      const sections = await loadSpecificTestData({
        projectName: p.name,
        configName: c.name,
        name: "Sections",
      });
      for (const [idx, s] of Object.entries(Object.values(sections))) {
        // TODO get rid of condition once we have scrollbar in file menu
        if (idx < 5) {
          output.push({
            id: s.id,
            name: s.name,
            selectable: true,
            depth: 2,
          });
        }
      }
    }
  }
  return output;
}
