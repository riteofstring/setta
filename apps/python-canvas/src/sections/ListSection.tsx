import { Fragment, useState } from "react";

import { usePythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";

export type ListSectionData = {
  childCount: number;
  list: {
    id: string;
    name: string;
  };
  pending: boolean;
};

export function readListSectionData(value: unknown): ListSectionData {
  const record = readRecord(value, "List of Objects section data");
  requireExactFields(record, ["childCount", "list", "pending"]);
  const list = readRecord(record.list, "List of Objects section list");
  requireExactFields(list, ["id", "name"]);
  const childCount = record.childCount;
  if (
    typeof childCount !== "number" ||
    !Number.isSafeInteger(childCount) ||
    childCount < 0
  ) {
    throw new Error(
      "List of Objects childCount must be a non-negative integer.",
    );
  }
  if (typeof record.pending !== "boolean") {
    throw new Error("List of Objects pending must be a boolean.");
  }
  return {
    childCount,
    list: {
      id: readStableId(list.id, "list.id"),
      name: readNonBlankString(list.name, "list.name"),
    },
    pending: record.pending,
  };
}

export function ListSection({ data }: { data: ListSectionData }) {
  const mutation = usePythonCanvasMutationContext();
  const [count, setCount] = useState<number | "">(1);
  const error = mutation.listMutationError(data.list.id);

  function changeCount(value: string) {
    if (value === "") {
      setCount("");
      return;
    }
    const parsed = Number.parseInt(value);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      setCount(parsed);
    }
  }

  function resetEmptyCount() {
    if (count === "" || count === 0) {
      setCount(1);
    }
  }

  function invoke(action: (nextCount: number) => void) {
    if (typeof count === "number") {
      action(count);
    }
  }

  return (
    <Fragment>
      <div className="section-key-value section-row-main -mx-2 flex items-center gap-1 rounded-lg bg-setta-100 pl-2 pr-1 dark:bg-setta-950">
        <ListRootIcon />
        <p className="text-[10px] font-bold text-setta-500">Children: </p>
        <input
          aria-label="Child count"
          className="nodrag setta-workspace-native-reset max-w-[3ch] cursor-auto rounded-md bg-white px-2 text-xs focus-visible:ring-2 dark:bg-setta-800 dark:text-setta-300"
          disabled={data.pending}
          name="children"
          onBlur={resetEmptyCount}
          onChange={(event) => changeCount(event.target.value)}
          value={count}
        />
        <button
          aria-label="Remove children"
          className="nodrag setta-workspace-native-reset gg-math-minus rounded-full focus-visible:ring-2 dark:text-setta-300"
          data-setta-workspace-touch-target="compact"
          disabled={data.pending}
          onClick={() =>
            invoke((nextCount) =>
              mutation.onListDecrement(data.list.id, nextCount),
            )
          }
          type="button"
        />
        <button
          aria-label="Add children"
          className="nodrag setta-workspace-native-reset gg-math-plus rounded-full focus-visible:ring-2 dark:text-setta-300"
          data-setta-workspace-touch-target="compact"
          disabled={data.pending}
          onClick={() =>
            invoke((nextCount) =>
              mutation.onListIncrement(data.list.id, nextCount),
            )
          }
          type="button"
        />
      </div>
      {error === null ? null : (
        <p className="python-canvas-announcer" role="alert">
          {error}
        </p>
      )}
    </Fragment>
  );
}

function ListRootIcon() {
  return (
    <svg
      aria-hidden="true"
      className="text-setta-300 dark:text-setta-600"
      fill="none"
      focusable="false"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 15l-3 3l-3 -3" />
      <path d="M7 6v12" />
      <path d="M14 18.333c0 .369 .298 .667 .667 .667h2.666a.667 .667 0 0 0 .667 -.667v-2.666a.667 .667 0 0 0 -.667 -.667h-2.666a.667 .667 0 0 0 -.667 .667v2.666z" />
      <path d="M14 10.833c0 .645 .522 1.167 1.167 1.167h4.666c.645 0 1.167 -.522 1.167 -1.167v-4.666c0 -.645 -.522 -1.167 -1.167 -1.167h-4.666c-.645 0 -1.167 .522 -1.167 1.167v4.666z" />
    </svg>
  );
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactFields(
  value: Record<string, unknown>,
  fields: ReadonlyArray<string>,
): void {
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !keys.includes(field))
  ) {
    throw new Error("List of Objects section data contains unexpected fields.");
  }
}

function readStableId(value: unknown, field: string): string {
  const id = readNonBlankString(value, field);
  if (id !== id.trim()) {
    throw new Error(`${field} must not include surrounding whitespace.`);
  }
  return id;
}

function readNonBlankString(value: unknown, field: string): string {
  const text = readString(value, field);
  if (text.trim() === "") {
    throw new Error(`${field} must not be empty.`);
  }
  return text;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}
