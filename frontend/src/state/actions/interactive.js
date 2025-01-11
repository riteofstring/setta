import _ from "lodash";
import { dbGetArtifactIdsFromNamePathType } from "requests/artifacts";
import { dbFormateCode, dbUpdateInteractiveCode } from "requests/interactive";
import { sendMessage } from "requests/websocket";
import {
  useArtifacts,
  useInteractive,
  useSectionInfos,
} from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { updateArtifacts } from "./artifacts";
import { setNotificationMessage } from "./notification";
import { getSectionVariant } from "./sectionInfos";

export async function updateInteractiveCode() {
  setNotificationMessage("Importing your code...");
  const res = await dbUpdateInteractiveCode();
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

export async function updateInteractiveData(artifacts) {
  console.log("updateInteractiveData", artifacts);
  if (artifacts.length === 0) {
    return;
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

async function maybeGetNewArtifactIds(content) {
  if (content.length === 0) {
    return;
  }

  const existingNamePathTypeToId = {};
  for (const [artId, art] of Object.entries(useArtifacts.getState().x)) {
    existingNamePathTypeToId[
      JSON.stringify(_.pick(art, ["name", "path", "type"]))
    ] = artId;
  }

  const missingIdx = [];
  const namesPathsTypes = [];
  for (const [idx, c] of content.entries()) {
    if (!("path" in c)) {
      c["path"] = "";
    }

    const namePathType = _.pick(c, ["name", "path", "type"]);
    const match = existingNamePathTypeToId[JSON.stringify(namePathType)];

    if (!match) {
      missingIdx.push(idx);
      namesPathsTypes.push(namePathType);
    } else {
      c["id"] = artId;
    }
  }

  const res = await dbGetArtifactIdsFromNamePathType(namesPathsTypes);
  if (res.status == 200) {
    for (const [idx, artifactId] of res.data.entries()) {
      const originalIdx = missingIdx[idx];
      content[originalIdx]["id"] = artifactId ?? createNewId();
    }
  }
}
