import { dbFormateCode, dbUpdateInteractiveCode } from "requests/interactive";
import { sendMessage } from "requests/websocket";
import { useInteractive, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { updateArtifacts } from "./artifacts";
import { setNotificationMessage } from "./notification";
import { setAllRunGroupsAndMaybeCreateSection } from "./runGroups/runGroups";
import { getSectionVariant } from "./sectionInfos";

export async function updateInteractiveCode() {
  setNotificationMessage("Importing your code...");
  const res = await dbUpdateInteractiveCode();
  setNotificationMessage("Done importing");
  if (res.status === 200) {
    const taskMetadata = res.data.taskMetadata;
    for (const t of taskMetadata) {
      if (t.dependencies !== null) {
        t.dependencies = new Set(t.dependencies.map((d) => JSON.stringify(d)));
      }
    }
    console.log("taskMetadata", taskMetadata);
    useInteractive.setState({ taskMetadata });
    updateInteractiveData(res.data.content);
  }
}

export async function updateInteractiveData(data) {
  console.log("updateInteractiveData", data);
  if (data.length === 0) {
    return;
  }
  const artifacts = [];
  for (const d of data) {
    if (d.type === "runGroupControl") {
      setAllRunGroupsAndMaybeCreateSection(d.value);
    } else if (["list", "img"].includes(d.type)) {
      artifacts.push({ ...d, path: "" });
    } else {
      console.error("incorrect interactive type", d);
    }
  }
  updateArtifacts({ artifacts, addSection: true });
}

export async function formatCode() {
  const res = await dbFormateCode();
  if (res.status === 200) {
    useSectionInfos.setState((state) => {
      for (const [sectionId, code] of Object.entries(res.data)) {
        if (code !== null) {
          getSectionVariant(sectionId, state).code = code;
        }
      }
    });
  }
}

export function sendToInteractiveTasks(sourceInfo, value) {
  const key = JSON.stringify(sourceInfo);
  const content = { [key]: value };
  for (const t of useInteractive.getState().taskMetadata) {
    if (t.dependencies === null || t.dependencies.has(key)) {
      sendMessage({ id: createNewId(), content, messageType: t.name });
    }
  }
}
