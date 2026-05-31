import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { InstalledEditorApp } from "@shared/types";

const execFileAsync = promisify(execFile);

type EditorOpenMode = "app" | "finder";

interface EditorDefinition {
  id: string;
  displayName: string;
  openMode: EditorOpenMode;
  paths: (homeDir: string) => string[];
}

interface EditorDiscoveryOptions {
  homeDir?: string;
  pathExists?: (path: string) => Promise<boolean>;
}

interface EditorOpenRuntime extends EditorDiscoveryOptions {
  openPath: (path: string) => Promise<string>;
  runOpenApp?: (appPath: string, rootPath: string) => Promise<void>;
}

const userApplications = (homeDir: string, name: string) => join(homeDir, "Applications", name);
const systemApplication = (name: string) => join("/Applications", name);

const editorDefinitions = [
  {
    displayName: "VS Code",
    id: "vscode",
    openMode: "app",
    paths: (homeDir) => [
      systemApplication("Visual Studio Code.app"),
      userApplications(homeDir, "Visual Studio Code.app"),
    ],
  },
  {
    displayName: "Cursor",
    id: "cursor",
    openMode: "app",
    paths: (homeDir) => [systemApplication("Cursor.app"), userApplications(homeDir, "Cursor.app")],
  },
  {
    displayName: "Zed",
    id: "zed",
    openMode: "app",
    paths: (homeDir) => [systemApplication("Zed.app"), userApplications(homeDir, "Zed.app")],
  },
  {
    displayName: "Finder",
    id: "finder",
    openMode: "finder",
    paths: () => ["/System/Library/CoreServices/Finder.app"],
  },
  {
    displayName: "Terminal",
    id: "terminal",
    openMode: "app",
    paths: () => [
      "/System/Applications/Utilities/Terminal.app",
      "/Applications/Utilities/Terminal.app",
    ],
  },
  {
    displayName: "Ghostty",
    id: "ghostty",
    openMode: "app",
    paths: (homeDir) => [
      systemApplication("Ghostty.app"),
      userApplications(homeDir, "Ghostty.app"),
    ],
  },
  {
    displayName: "Android Studio",
    id: "android-studio",
    openMode: "app",
    paths: (homeDir) => [
      systemApplication("Android Studio.app"),
      userApplications(homeDir, "Android Studio.app"),
    ],
  },
] satisfies EditorDefinition[];

export async function listInstalledEditorApps(
  getIconDataURL: (appPath: string) => Promise<string>,
  options: EditorDiscoveryOptions = {},
): Promise<InstalledEditorApp[]> {
  const home = options.homeDir ?? homedir();
  const exists = options.pathExists ?? pathExists;
  const installedEditors = await Promise.all(
    editorDefinitions.map(async (definition) => {
      const appPath = await firstExistingPath(definition.paths(home), exists);
      if (!appPath) {
        return null;
      }
      return {
        displayName: definition.displayName,
        iconDataUrl: await iconDataURLOrEmpty(getIconDataURL, appPath),
        id: definition.id,
      };
    }),
  );
  return installedEditors.filter((editor): editor is InstalledEditorApp => editor !== null);
}

export async function openWorkspaceInEditor(
  editorId: string,
  rootPath: string,
  runtime: EditorOpenRuntime,
) {
  if (!rootPath) {
    throw new Error("workspace path is required");
  }
  const definition = editorDefinitions.find((candidate) => candidate.id === editorId);
  if (!definition) {
    throw new Error(`unknown editor: ${editorId}`);
  }
  const appPath = await firstExistingPath(
    definition.paths(runtime.homeDir ?? homedir()),
    runtime.pathExists ?? pathExists,
  );
  if (!appPath) {
    throw new Error(`${definition.displayName} is not installed`);
  }
  if (definition.openMode === "finder") {
    const errorMessage = await runtime.openPath(rootPath);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    return;
  }
  await (runtime.runOpenApp ?? openApp)(appPath, rootPath);
}

async function firstExistingPath(
  paths: string[],
  exists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  for (const path of paths) {
    if (await exists(path)) {
      return path;
    }
  }
  return null;
}

async function pathExists(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function iconDataURLOrEmpty(
  getIconDataURL: (appPath: string) => Promise<string>,
  appPath: string,
) {
  try {
    return await getIconDataURL(appPath);
  } catch {
    return "";
  }
}

async function openApp(appPath: string, rootPath: string) {
  await execFileAsync("open", ["-a", appPath, rootPath], {
    windowsHide: true,
  });
}
