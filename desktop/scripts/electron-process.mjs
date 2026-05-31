import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const shutdownTimeoutMs = 10_000;

export async function stopElectron(child) {
  if (!child.pid) {
    return;
  }
  const pid = child.pid;
  const exitPromise = child.exitCode === null ? onceExit(child) : Promise.resolve();
  signalElectronProcessGroup(child, "SIGTERM");
  const exited = await Promise.race([
    Promise.all([exitPromise, waitForElectronProcessGroupExit(child, pid, shutdownTimeoutMs)]).then(
      () => true,
    ),
    delay(shutdownTimeoutMs).then(() => false),
  ]);
  if (!exited) {
    signalElectronProcessGroup(child, "SIGKILL");
    await Promise.race([
      Promise.all([exitPromise, waitForElectronProcessGroupExit(child, pid, 3_000)]),
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
        if (error?.code !== "EPERM") {
          throw error;
        }
        signalElectronChild(child, signal);
        return;
      }
    }
  }
  signalElectronChild(child, signal);
}

async function waitForElectronProcessGroupExit(child, pid, timeoutMs) {
  if (process.platform === "win32") {
    return;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (probeElectronProcessGroupExit(child, pid)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Electron process group ${pid} did not exit`);
}

function probeElectronProcessGroupExit(child, pid) {
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return true;
    }
    if (error?.code === "EPERM") {
      return hasChildExited(child);
    }
    throw error;
  }
}

function onceExit(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
}

function hasChildExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalElectronChild(child, signal) {
  if (hasChildExited(child)) {
    return;
  }
  child.kill(signal);
}
