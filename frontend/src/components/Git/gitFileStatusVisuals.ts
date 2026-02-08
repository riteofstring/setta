import type { GitCommitChangedFile, GitStatusEntry } from "utils/generatedTypes";

export type GitFileStatusCategory =
  | "added"
  | "changed"
  | "deleted"
  | "conflict"
  | "other";

export type GitFileStatusVisuals = {
  badgeClassName: string;
};

function firstStatusChar(statusCode: string): string {
  const trimmed = statusCode.trim();
  if (!trimmed) {
    return " ";
  }
  return trimmed[0] ?? " ";
}

export function gitFileStatusCategoryFromCode(
  statusCode: string,
): GitFileStatusCategory {
  const code = firstStatusChar(statusCode).toUpperCase();
  if (code === "A" || code === "?") {
    return "added";
  }
  if (code === "D") {
    return "deleted";
  }
  if (code === "U") {
    return "conflict";
  }
  if (code === "M" || code === "R" || code === "C" || code === "T") {
    return "changed";
  }
  return "other";
}

export function gitFileStatusCategoryFromEntry(
  entry: GitStatusEntry,
): GitFileStatusCategory {
  if (entry.kind === "untracked") {
    return "added";
  }
  if (entry.kind === "conflict") {
    return "conflict";
  }
  const statusCode =
    entry.kind === "staged" ? entry.indexStatus : entry.worktreeStatus;
  return gitFileStatusCategoryFromCode(statusCode);
}

export function gitFileStatusCategoryFromCommitFile(
  file: GitCommitChangedFile,
): GitFileStatusCategory {
  return gitFileStatusCategoryFromCode(file.status);
}

export function gitFileStatusVisuals(
  category: GitFileStatusCategory,
): GitFileStatusVisuals {
  if (category === "added") {
    return {
      badgeClassName:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }
  if (category === "changed") {
    return {
      badgeClassName:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }
  if (category === "deleted") {
    return {
      badgeClassName:
        "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    };
  }
  if (category === "conflict") {
    return {
      badgeClassName:
        "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    };
  }
  return {
    badgeClassName:
      "bg-setta-100 text-setta-600 dark:bg-setta-900 dark:text-setta-300",
  };
}
