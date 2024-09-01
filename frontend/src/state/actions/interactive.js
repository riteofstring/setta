import { dbUpdateInteractiveCode } from "requests/interactive";
import { useInteractive } from "state/definitions";
import { updateArtifacts } from "./artifacts";
import { setNotificationMessage } from "./notification";

export async function updateInteractiveCode() {
  setNotificationMessage("Importing your code...");
  const res = await dbUpdateInteractiveCode();
  setNotificationMessage("Done importing");
  if (res.status == 200) {
    useInteractive.setState({ taskNames: res.data.taskNames });
  }
}

export async function updateInteractiveData(data) {
  const dataInArtifactForm = {};
  for (const d of data) {
    dataInArtifactForm[`interactive:${d.displayName}`] = d;
  }
  updateArtifacts({ artifacts: dataInArtifactForm, addSection: true });
}
