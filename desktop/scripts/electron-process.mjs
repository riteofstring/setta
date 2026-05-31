import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const shutdownTimeoutMs = 10_000;

export async function stopElectron(child) {
  if (!child.pid) {
    return;
  }
  const exitPromise = child.exitCode === null ? onceExit(child) : Promise.resolve();
  signalElectronProcessGroup(child, "SIGTERM");
  const exited = await Promise.race([
    Promise.all([exitPromise, waitForElectronProcessGroupExit(child.pid, shutdownTimeoutMs)]).then(
      () => true,
    ),
    delay(shutdownTimeoutMs).then(() => false),
  ]);
  if (!exited) {
    signalElectronProcessGroup(child, "SIGKILL");
    await Promise.race([
      Promise.all([exitPromise, waitForElectronProcessGroupExit(child.pid, 3_000)]),
      delay(3_000),
    ]);
  }
}

function signalElectronProcessGroup(child, signal) {
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }
  if (child.exitCode === null) {
    child.kill(signal);
  }
}

async function waitForElectronProcessGroupExit(pid, timeoutMs) {
  if (process.platform === "win32") {
    return;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") {
        return;
      }
      throw error;
    }
    await delay(100);
  }
  throw new Error(`Electron process group ${pid} did not exit`);
}

function onceExit(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
}
