import { Buffer } from "node:buffer";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const shortTemporaryDirectory = process.platform === "win32" ? tmpdir() : "/tmp";
const unixSocketPathLimit = 104;
const longestFixtureSocketRelativePath = join("control-plane", "data", "admin.sock");

export async function createElectronFixtureTempRoot() {
  let directory;
  try {
    directory = await mkdtemp(join(shortTemporaryDirectory, "setta-"));
    await chmod(directory, 0o700);
  } catch (error) {
    if (directory) {
      await rm(directory, { force: true, recursive: true });
    }
    throw new Error(
      `create private Electron fixture temporary directory for Unix socket within ${unixSocketPathLimit}-byte sun_path limit: ${error.message}`,
      { cause: error },
    );
  }

  if (process.platform === "win32") {
    return directory;
  }

  const socketPath = join(directory, longestFixtureSocketRelativePath);
  const socketPathLength = Buffer.byteLength(socketPath);
  if (socketPathLength >= unixSocketPathLimit) {
    await rm(directory, { force: true, recursive: true });
    throw new Error(
      `temporary Electron fixture Unix socket path ${JSON.stringify(socketPath)} is ${socketPathLength} bytes; ${unixSocketPathLimit}-byte sun_path limit requires fewer than ${unixSocketPathLimit} bytes`,
    );
  }
  return directory;
}
