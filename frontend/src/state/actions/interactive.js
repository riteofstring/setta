import { dbUpdateInteractiveCode } from "requests/interactive";
import { useInteractive } from "state/definitions";
import { updateArtifacts } from "./artifacts";
import { setNotificationMessage } from "./notification";
import { setAllRunGroupsAndMaybeCreateSection } from "./runGroups/runGroups";

export async function updateInteractiveCode() {
  setNotificationMessage("Importing your code...");
  const res = await dbUpdateInteractiveCode();
  setNotificationMessage("Done importing");
  if (res.status == 200) {
    useInteractive.setState({ taskMetadata: res.data.taskMetadata });
    updateInteractiveData(res.data.content);
  }
}

export async function updateInteractiveData(data) {
  if (data.length === 0) {
    return;
  }
  const dataInArtifactForm = {};
  for (const d of data) {
    if (d.type === "runGroupControl") {
      setAllRunGroupsAndMaybeCreateSection(d.value);
    } else if (["list", "img"].includes(d.type)) {
      dataInArtifactForm[`interactive:${d.displayName}`] = d;
    } else {
      console.error("incorrect interactive type", d);
    }
  }
  updateArtifacts({ artifacts: dataInArtifactForm, addSection: true });
}
