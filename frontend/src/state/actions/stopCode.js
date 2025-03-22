import { dbKillInMemorySubprocesses } from "requests/interactive";
import { addTemporaryNotification } from "./notifications";

export async function stopCode() {
  addTemporaryNotification("Stopping subprocesses");
  dbKillInMemorySubprocesses();
}
