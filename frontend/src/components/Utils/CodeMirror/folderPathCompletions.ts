import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import {
  isAbsoluteBrowserPath,
  normalizeBrowserPath,
  resolvePathWithinRoot,
} from "utils/browserPaths";
import { res200 } from "utils/endpointUtils";
import { route_get_folder_contents } from "utils/generatedEndpoints";
import type { FolderContentItem } from "utils/generatedTypes";

type FolderPathCompletionOptions = {
  rootPath: string | null;
  pathSeparator?: string;
  ignorePatterns?: string[] | null;
  maxEntries?: number;
};

function resolveSeparator(text: string, fallback: string): string {
  const lastSlash = text.lastIndexOf("/");
  const lastBackslash = text.lastIndexOf("\\");
  if (lastSlash === -1 && lastBackslash === -1) {
    return fallback;
  }
  return lastSlash > lastBackslash ? "/" : "\\";
}

function splitPathInput(text: string, fallbackSeparator: string) {
  const lastSlash = text.lastIndexOf("/");
  const lastBackslash = text.lastIndexOf("\\");
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  const separator = resolveSeparator(text, fallbackSeparator);
  if (lastSeparator < 0) {
    return {
      dirPart: "",
      from: 0,
      separator,
    };
  }
  return {
    dirPart: text.slice(0, lastSeparator),
    from: lastSeparator + 1,
    separator,
  };
}

async function loadFolderEntries({
  folderPath,
  ignorePatterns,
  maxEntries,
}: {
  folderPath: string;
  ignorePatterns: string[] | null | undefined;
  maxEntries: number | undefined;
}): Promise<FolderContentItem[]> {
  const res = await route_get_folder_contents({
    folderPath,
    ignorePatterns: ignorePatterns ?? null,
    maxEntries: maxEntries ?? null,
  });
  if (!res200(res)) {
    return [];
  }
  return res.data;
}

export function createFolderPathCompletionSource(
  options: FolderPathCompletionOptions,
): CompletionSource | null {
  if (!options.rootPath) {
    return null;
  }
  const fallbackSeparator =
    options.pathSeparator ??
    (options.rootPath.includes("\\") ? "\\" : "/");
  const cache = new Map<string, FolderContentItem[]>();
  const inflight = new Map<string, Promise<FolderContentItem[]>>();

  const getEntries = async (folderPath: string) => {
    const cached = cache.get(folderPath);
    if (cached) {
      return cached;
    }
    const pending = inflight.get(folderPath);
    if (pending) {
      return pending;
    }
    const request = loadFolderEntries({
      folderPath,
      ignorePatterns: options.ignorePatterns,
      maxEntries: options.maxEntries,
    }).then((entries) => {
      inflight.delete(folderPath);
      cache.set(folderPath, entries);
      return entries;
    });
    inflight.set(folderPath, request);
    return request;
  };

  return async (context) => {
    const textBefore = context.state.doc.sliceString(0, context.pos);
    if (!context.explicit && textBefore.length === 0) {
      return null;
    }
    if (
      isAbsoluteBrowserPath(textBefore) &&
      !resolvePathWithinRoot(textBefore, options.rootPath)
    ) {
      return null;
    }

    const { dirPart, from, separator } = splitPathInput(
      textBefore,
      fallbackSeparator,
    );
    const targetFolder = resolvePathWithinRoot(
      dirPart || "",
      options.rootPath,
    );
    if (!targetFolder) {
      return null;
    }
    const entries = await getEntries(targetFolder);
    const optionsList: Completion[] = entries
      .filter((entry) => entry.type === "folder")
      .map((entry) => ({
        label: entry.name,
        type: "folder",
        apply: `${entry.name}${separator}`,
      }));
    if (optionsList.length === 0) {
      return null;
    }
    return {
      from,
      to: context.pos,
      options: optionsList,
      filter: true,
    };
  };
}
