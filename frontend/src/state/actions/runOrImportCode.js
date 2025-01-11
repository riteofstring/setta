import { dbImportCodeBlocks } from "requests/interactive";
import { useInteractive } from "state/definitions";
import { maybeGetNewArtifactIds, updateInteractiveData } from "./interactive";
import { setNotificationMessage } from "./notification";
import {
  getProjectDataToGenerateCode,
  getProjectRuns,
  sendRunCodeMessage,
} from "./project/generateCode";

export async function importCodeBlocks(sectionIds) {
  setNotificationMessage("Importing your code...");
  const res = await dbImportCodeBlocks(sectionIds);
  if (res.status === 200) {
    const taskMetadata = res.data.taskMetadata;
    for (const t of taskMetadata) {
      if (t.dependencies !== null) {
        t.dependencies = new Set(t.dependencies.map((d) => JSON.stringify(d)));
      }
    }
    console.log("taskMetadata", taskMetadata);
    useInteractive.setState({ taskMetadata });
    await maybeGetNewArtifactIds(res.data.content);
    updateInteractiveData(res.data.content);
    setNotificationMessage("Done importing");
  }
}

export async function runCodeBlocks(sectionIds) {
  const project = getProjectDataToGenerateCode({
    includeInfoToFullName: false,
  });
  project.runCodeBlocks = sectionIds;
  await sendRunCodeMessage(project);
}

export async function runCode() {
  const project = getProjectDataToGenerateCode({
    includeInfoToFullName: false,
  });
  let count = 0;
  for (const projectVariant of getProjectRuns(project)) {
    await sendRunCodeMessage(projectVariant, count);
    count += 1;
  }
}
