import { useEffect, useState } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import { readInputSectionData } from "./sectionData";

function inputValue(value: WorkspaceSectionData, inputKind: string): string {
  if (inputKind === "boolean") {
    return value === true ? "true" : "false";
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function InputSection({ section }: { section: WorkspaceSection }) {
  const { actions } = useRealtime();
  const data = readInputSectionData(section.data);
  const [draft, setDraft] = useState(() =>
    inputValue(data.value, data.inputKind),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(inputValue(data.value, data.inputKind));
  }, [data.inputKind, data.value]);

  const settle = async (event: "change" | "submit") => {
    const value =
      data.inputKind === "number"
        ? Number(draft)
        : data.inputKind === "boolean"
          ? draft === "true"
          : draft;
    if (data.inputKind === "number" && !Number.isFinite(value)) {
      setError("Enter a finite number.");
      return;
    }
    setError(null);
    const committed = await actions.commitSectionData(section.id, {
      ...data,
      value,
    });
    if (committed) {
      actions.emit(section.id, event, { value });
    }
  };

  if (data.inputKind === "boolean") {
    return (
      <label className="realtime-field realtime-switch-field">
        <input
          checked={draft === "true"}
          className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
          onChange={(event) => {
            const value = event.currentTarget.checked;
            setDraft(value ? "true" : "false");
            void actions
              .commitSectionData(section.id, { ...data, value })
              .then((committed) => {
                if (committed) {
                  actions.emit(section.id, "change", { value });
                }
              });
          }}
          type="checkbox"
        />
        <span>{data.label}</span>
      </label>
    );
  }

  return (
    <label className="realtime-field">
      <span>{data.label}</span>
      <input
        aria-describedby={error === null ? undefined : `${section.id}-error`}
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
        onBlur={() => void settle("change")}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void settle("submit");
          }
        }}
        step="any"
        type={data.inputKind === "number" ? "number" : "text"}
        value={draft}
      />
      <span
        className="realtime-field-error"
        id={`${section.id}-error`}
        role="alert"
      >
        {error}
      </span>
    </label>
  );
}
