import { useState } from "react";

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
    throw new Error("List of Objects childCount must be a non-negative integer.");
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
  const decrementUnavailable = data.pending || data.childCount === 0;
  const incrementUnavailable = data.pending;
  const requestCount = typeof count === "number" && count > 0 ? count : null;
  const error = mutation.listMutationError(data.list.id);

  return (
    <div className="python-canvas-list-section">
      <div className="python-canvas-list-incrementer">
        <label
          className="python-canvas-list-incrementer-label"
          htmlFor={`list-child-count:${data.list.id}`}
        >
          Children
        </label>
        <input
          className="python-canvas-list-incrementer-input"
          id={`list-child-count:${data.list.id}`}
          inputMode="numeric"
          min={1}
          name="children"
          onBlur={() => {
            if (count === "" || count <= 0) {
              setCount(1);
            }
          }}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "") {
              setCount("");
              return;
            }
            const next = Number(value);
            if (Number.isSafeInteger(next) && next >= 0) {
              setCount(next);
              return;
            }
            setCount("");
          }}
          type="number"
          value={count}
        />
        <button
          aria-label="Remove children"
          className="python-canvas-list-incrementer-button"
          disabled={decrementUnavailable}
          onClick={() => {
            if (requestCount !== null) {
              mutation.onListDecrement(data.list.id, requestCount);
            }
          }}
          type="button"
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          aria-label="Add children"
          className="python-canvas-list-incrementer-button"
          disabled={incrementUnavailable}
          onClick={() => {
            if (requestCount !== null) {
              mutation.onListIncrement(data.list.id, requestCount);
            }
          }}
          type="button"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {error === null ? null : (
        <p className="python-canvas-announcer" role="alert">
          {error}
        </p>
      )}
    </div>
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
