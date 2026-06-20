import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { app } from "electron";

const execFileAsync = promisify(execFile);

export async function readEditorIconDataURL(iconPath: string, appPath: string) {
  if (process.platform === "darwin" && iconPath.endsWith(".icns")) {
    return convertIcnsToDataURL(iconPath);
  }
  const icon = await app.getFileIcon(appPath, { size: "large" });
  return icon.toDataURL();
}

async function convertIcnsToDataURL(iconPath: string) {
  const dir = await mkdtemp(join(tmpdir(), "setta-editor-icon-"));
  const outputPath = join(dir, "icon.png");
  try {
    await execFileAsync(
      "/usr/bin/sips",
      ["-s", "format", "png", "-Z", "32", iconPath, "--out", outputPath],
      {
        timeout: 5_000,
        windowsHide: true,
      },
    );
    const bytes = await readFile(outputPath);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
