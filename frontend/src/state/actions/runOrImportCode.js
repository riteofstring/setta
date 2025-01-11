import { dbImportCodeBlocks } from "requests/interactive";
import { useInMemoryFn } from "state/definitions";
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
    for (const metadata of Object.values(res.data.metadata)) {
      if (metadata.dependencies !== null) {
        metadata.dependencies = new Set(
          metadata.dependencies.map((d) => JSON.stringify(d)),
        );
      }
    }
    useInMemoryFn.setState((state) => ({
      metadata: { ...state.metadata, ...res.data.metadata },
    }));
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
