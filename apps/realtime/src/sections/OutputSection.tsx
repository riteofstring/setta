import type { WorkspaceSection } from "@setta/workspace";

import { runtimeValueKey } from "../app/runtimeState";
import { useRealtime } from "../app/runtimeContext";
import { contentUrl } from "../backend/client";
import {
  type ContentReference,
  validateContentReference,
} from "../backend/generatedContract";
import { readOutputSectionData } from "./sectionData";

function contentReference(value: unknown): ContentReference | null {
  return validateContentReference(value) ? value : null;
}

function presentValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

export function OutputSection({ section }: { section: WorkspaceSection }) {
  const { runtime } = useRealtime();
  const data = readOutputSectionData(section.data);
  const value =
    runtime.values[runtimeValueKey(section.id, "value")] ?? data.value;
  const reference =
    contentReference(
      runtime.values[runtimeValueKey(section.id, "contentRef")],
    ) ?? contentReference(value);
  return reference?.mediaType.startsWith("image/") ? (
    <img
      alt={`${section.name} output`}
      className="realtime-output-image"
      src={contentUrl(reference)}
    />
  ) : (
    <pre className="realtime-output-value">{presentValue(value)}</pre>
  );
}
