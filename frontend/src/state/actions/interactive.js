import { dbUpdateInteractiveCode } from "requests/interactive";
import { useInteractive } from "state/definitions";
import { setNotificationMessage } from "./notification";

export async function updateInteractiveCode() {
  setNotificationMessage("Importing your code...");
  const res = await dbUpdateInteractiveCode();
  setNotificationMessage("Done importing");
  if (res.status == 200) {
    useInteractive.setState({ taskNames: res.data.taskNames });
  }
}
