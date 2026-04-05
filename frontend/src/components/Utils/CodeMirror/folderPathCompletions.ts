import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import {
  getFolderContents,
  type FilebrowserFolderContentItem as FolderContentItem,
  type FilebrowserListFolderResponse as ListFolderResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  isAbsoluteBrowserPath,
  normalizeBrowserPath,
} from "utils/browserPaths";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";

type FolderPathCompletionOptions = {
  rootPath: string | null;
  pathSeparator?: string;
  ignorePatterns?: string[] | null;
  maxEntries?: number;
  allowOutsideWorkspaceRoot?: boolean;
};

const WINDOWS_DRIVE_ROOT_REGEX = /^[A-Za-z]:$/;
type GetFolderContentsRouteResponse = ResponseDataAndStatus<ListFolderResponse>;

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

function resolveAbsoluteCompletionFolder(absoluteCandidate: string) {
  const normalizedCandidate = normalizeBrowserPath(absoluteCandidate);
  if (WINDOWS_DRIVE_ROOT_REGEX.test(normalizedCandidate)) {
    return `${normalizedCandidate}/`;
  }
  return normalizedCandidate;
}

async function loadFolderEntries({
  folderPath,
  baseFolderPath,
  ignorePatterns,
  maxEntries,
  allowOutsideWorkspaceRoot,
}: {
  folderPath: string;
  baseFolderPath: string | null;
  ignorePatterns: string[] | null | undefined;
  maxEntries: number | undefined;
  allowOutsideWorkspaceRoot: boolean | undefined;
}): Promise<FolderContentItem[]> {
  const res: GetFolderContentsRouteResponse = await callOpenAPI(
    getFolderContents({
      body: {
        folderPath,
        baseFolderPath,
        ignorePatterns: ignorePatterns ?? null,
        maxEntries: maxEntries ?? null,
        allowOutsideWorkspaceRoot: allowOutsideWorkspaceRoot ?? false,
        missingFolderBehavior: "empty",
      },
    }),
  );
  if (!res200(res)) {
    return [];
  }
  return res.data.items;
}

export function createFolderPathCompletionSource(
  options: FolderPathCompletionOptions,
): CompletionSource | null {
  if (!options.rootPath) {
    return null;
  }
  const fallbackSeparator =
    options.pathSeparator ?? (options.rootPath.includes("\\") ? "\\" : "/");
  const cache = new Map<string, FolderContentItem[]>();
  const inflight = new Map<string, Promise<FolderContentItem[]>>();

  const getEntries = (folderPath: string, baseFolderPath: string | null) => {
    const requestKey = `${baseFolderPath ?? ""}::${folderPath}`;
    const cached = cache.get(requestKey);
    if (cached) {
      return cached;
    }
    const pending = inflight.get(requestKey);
    if (pending) {
      return pending;
    }
    const request = loadFolderEntries({
      folderPath,
      baseFolderPath,
      ignorePatterns: options.ignorePatterns,
      maxEntries: options.maxEntries,
      allowOutsideWorkspaceRoot: options.allowOutsideWorkspaceRoot,
    }).then((entries) => {
      inflight.delete(requestKey);
      cache.set(requestKey, entries);
      return entries;
    });
    inflight.set(requestKey, request);
    return request;
  };

  return (context) => {
    const textBefore = context.state.doc.sliceString(0, context.pos);
    if (!context.explicit && textBefore.length === 0) {
      return null;
    }

    const { dirPart, from, separator } = splitPathInput(
      textBefore,
      fallbackSeparator,
    );
    const useAbsolutePath = isAbsoluteBrowserPath(textBefore);
    const targetFolderPath = useAbsolutePath
      ? resolveAbsoluteCompletionFolder(dirPart || separator)
      : dirPart;
    const baseFolderPath = useAbsolutePath ? null : options.rootPath;
    if (!targetFolderPath && !baseFolderPath) {
      return null;
    }

    const to = context.pos;
    const makeResult = (entries: FolderContentItem[]) => {
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
        to,
        options: optionsList,
        filter: true,
      };
    };

    const entries = getEntries(targetFolderPath, baseFolderPath);
    if (Array.isArray(entries)) {
      return makeResult(entries);
    }
    return entries.then(makeResult);
  };
}

export function createDynamicFolderPathCompletionSource(
  getOptions: () => FolderPathCompletionOptions,
): CompletionSource {
  const cache = new Map<string, FolderContentItem[]>();
  const inflight = new Map<string, Promise<FolderContentItem[]>>();
  let lastCacheKey: string | null = null;

  const getCacheKey = (options: FolderPathCompletionOptions) => {
    const ignoreKey = (options.ignorePatterns ?? []).join("\n");
    return `${options.rootPath ?? ""}||${options.pathSeparator ?? ""}||${ignoreKey}||${options.maxEntries ?? ""}||${options.allowOutsideWorkspaceRoot === true}`;
  };

  const getEntries = (
    options: FolderPathCompletionOptions,
    folderPath: string,
    baseFolderPath: string | null,
  ) => {
    const requestKey = `${baseFolderPath ?? ""}::${folderPath}`;
    const cached = cache.get(requestKey);
    if (cached) {
      return cached;
    }
    const pending = inflight.get(requestKey);
    if (pending) {
      return pending;
    }
    const request = loadFolderEntries({
      folderPath,
      baseFolderPath,
      ignorePatterns: options.ignorePatterns,
      maxEntries: options.maxEntries,
      allowOutsideWorkspaceRoot: options.allowOutsideWorkspaceRoot,
    }).then((entries) => {
      inflight.delete(requestKey);
      cache.set(requestKey, entries);
      return entries;
    });
    inflight.set(requestKey, request);
    return request;
  };

  return (context) => {
    const options = getOptions();
    if (!options.rootPath) {
      return null;
    }
    const cacheKey = getCacheKey(options);
    if (lastCacheKey !== cacheKey) {
      cache.clear();
      inflight.clear();
      lastCacheKey = cacheKey;
    }

    const fallbackSeparator =
      options.pathSeparator ?? (options.rootPath.includes("\\") ? "\\" : "/");

    const textBefore = context.state.doc.sliceString(0, context.pos);
    if (!context.explicit && textBefore.length === 0) {
      return null;
    }

    const { dirPart, from, separator } = splitPathInput(
      textBefore,
      fallbackSeparator,
    );
    const useAbsolutePath = isAbsoluteBrowserPath(textBefore);
    const targetFolderPath = useAbsolutePath
      ? resolveAbsoluteCompletionFolder(dirPart || separator)
      : dirPart;
    const baseFolderPath = useAbsolutePath ? null : options.rootPath;
    if (!targetFolderPath && !baseFolderPath) {
      return null;
    }

    const to = context.pos;
    const makeResult = (entries: FolderContentItem[]) => {
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
        to,
        options: optionsList,
        filter: true,
      };
    };

    const entries = getEntries(options, targetFolderPath, baseFolderPath);
    if (Array.isArray(entries)) {
      return makeResult(entries);
    }
    return entries.then(makeResult);
  };
}
