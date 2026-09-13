import {
  createWorkspaceCodeSectionData,
  type WorkspaceItem,
  type WorkspaceItemSearchContext,
  type WorkspaceSection,
  type WorkspaceSectionItemTree,
} from "@setta/workspace";

import type {
  ApplicationSnapshotV1,
  CandidateV1,
  CheckV1,
} from "../backend/generatedContract";

type CurrentCase = ApplicationSnapshotV1["cases"][number];
type Evaluator = NonNullable<ApplicationSnapshotV1["project"]["evaluator"]>;

function jsonValue(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function readItemColumnWidth(previous: WorkspaceSection | undefined): number {
  return previous?.itemTree?.itemColumnWidth ?? 104;
}

function itemTree(
  rootId: string,
  topLevelItemIds: string[],
  items: Record<string, WorkspaceItem>,
  previous: WorkspaceSection | undefined,
): WorkspaceSectionItemTree {
  return {
    itemColumnWidth: readItemColumnWidth(previous),
    items: {
      ...items,
      [rootId]: { children: topLevelItemIds, id: rootId },
    },
    rootId,
    selectedItemIds: [],
  };
}

function readonlyJsonItem(id: string, label: string, value: unknown) {
  return {
    children: [],
    id,
    presentation: {
      control: {
        configuration: {
          autocomplete: "off" as const,
          disabled: true,
          placeholder: null,
          singleLine: true,
          wrapLines: true,
        },
        kind: "text" as const,
        value: jsonValue(value),
      },
      label,
      labelEditable: false,
    },
  } satisfies WorkspaceItem;
}

function readonlyTextItem(
  id: string,
  label: string,
  value: string,
  helpText?: string,
) {
  return {
    children: [],
    id,
    presentation: {
      control: {
        configuration: {
          autocomplete: "off" as const,
          disabled: true,
          placeholder: null,
          singleLine: true,
          wrapLines: true,
        },
        kind: "text" as const,
        value,
      },
      ...(helpText === undefined ? {} : { helpText }),
      label,
      labelEditable: false,
    },
  } satisfies WorkspaceItem;
}

function groupItem(id: string, label: string, children: string[]) {
  return {
    children,
    id,
    presentation: {
      control: { kind: "group" as const },
      label,
      labelEditable: false,
    },
  } satisfies WorkspaceItem;
}

export function projectCaseSetItemTree(
  cases: CurrentCase[],
  previous: WorkspaceSection | undefined,
): WorkspaceSectionItemTree {
  const rootId = "bench-input-root";
  const items: Record<string, WorkspaceItem> = {};
  const caseIds = cases.map((entry, index) => {
    const caseId = `bench-input-${String(index)}`;
    const inputId = `${caseId}-value`;
    const expectedId = `${caseId}-expected`;
    items[caseId] = groupItem(caseId, entry.name, [inputId, expectedId]);
    items[inputId] = readonlyJsonItem(inputId, "input", entry.input);
    items[expectedId] = readonlyJsonItem(
      expectedId,
      "expected",
      entry.expected,
    );
    return caseId;
  });
  return itemTree(rootId, caseIds, items, previous);
}

function checkRequirement(check: CheckV1): string {
  if (check.kind === "artifact_max_bytes") {
    if (check.maximumBytes === null) return "maximum size is not configured";
    const value =
      check.maximumBytes < 1_000
        ? `${String(check.maximumBytes)} B`
        : `${String(Math.round(check.maximumBytes / 1_000))} KB`;
    return `at most ${value}`;
  }
  return `${String(check.width ?? "?")} × ${String(check.height ?? "?")}`;
}

export function projectEvaluatorItemTree(
  evaluator: Evaluator,
  previous: WorkspaceSection | undefined,
): WorkspaceSectionItemTree {
  const rootId = "bench-check-root";
  const items: Record<string, WorkspaceItem> = {};
  const checkIds = evaluator.checks.map((check, index) => {
    const checkId = `bench-check-${String(index)}`;
    const artifactId = `${checkId}-artifact`;
    const requirementId = `${checkId}-requirement`;
    items[checkId] = groupItem(checkId, check.name, [
      artifactId,
      requirementId,
    ]);
    items[artifactId] = readonlyTextItem(
      artifactId,
      "output artifact",
      check.artifactName,
      "Every candidate result must emit an artifact with this name.",
    );
    items[requirementId] = readonlyTextItem(
      requirementId,
      "requirement",
      checkRequirement(check),
    );
    return checkId;
  });
  return itemTree(rootId, checkIds, items, previous);
}

function shellArgument(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function commandGroups(argv: string[]): string[][] {
  if (argv.length === 0) return [];
  const groups: string[][] = [[argv[0]!]];
  let optionSeen = false;
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]!;
    const isOption = /^-{1,2}[A-Za-z]/.test(value);
    if (!isOption && !optionSeen) {
      groups[0]!.push(value);
      continue;
    }
    optionSeen = optionSeen || isOption;
    if (isOption) {
      const group = [value];
      const next = argv[index + 1];
      if (
        !value.includes("=") &&
        next !== undefined &&
        !/^-{1,2}[A-Za-z]/.test(next)
      ) {
        group.push(next);
        index += 1;
      }
      groups.push(group);
      continue;
    }
    groups.push([value]);
  }
  return groups;
}

function candidateCommandCode(candidate: CandidateV1): string {
  return commandGroups(candidate.command.argv)
    .map((group) => group.map(shellArgument).join(" "))
    .join(" \\\n  ");
}

export function candidateCodeSectionData(candidate: CandidateV1) {
  return createWorkspaceCodeSectionData({
    code: candidateCommandCode(candidate),
    indentWidth: 2,
    language: "bash",
    lineNumbers: false,
    mode: "read-only",
    wrapLines: true,
  });
}

export function benchItemSearchableText(
  item: WorkspaceItemSearchContext["item"],
): string {
  const presentation = item.presentation;
  if (presentation === undefined) return "";
  const value =
    presentation.control.kind === "group" ? "" : presentation.control.value;
  return [presentation.label, value, presentation.helpText]
    .filter((entry): entry is string => entry !== undefined && entry !== "")
    .join(" ");
}
