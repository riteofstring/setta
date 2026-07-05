import { writeFileSync } from "node:fs";

const markerPath = process.env.SETTA_BACKEND_SUPERVISOR_TERMINATED;
const pidPath = process.env.SETTA_BACKEND_SUPERVISOR_PID;
const readyForSignalPath = process.env.SETTA_BACKEND_SUPERVISOR_READY_FOR_SIGNAL;

if (!markerPath || !readyForSignalPath) {
  console.error("missing backend supervisor timeout fixture paths");
  process.exit(2);
}

process.on("SIGTERM", () => {
  writeFileSync(markerPath, "terminated");
  process.exit(0);
});

if (pidPath) {
  writeFileSync(pidPath, String(process.pid));
}
writeFileSync(readyForSignalPath, "ready");
setInterval(() => {}, 1000);
