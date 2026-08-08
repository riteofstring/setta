import {
  WorkspaceInteractionBoundary,
  type SectionDefinition,
  type SectionRenderProps,
} from "@setta/workspace/react";

import type {
  PlaygroundNoteData,
  PlaygroundSectionData,
  PlaygroundStatusData,
} from "./playground-model.js";

function noteData(data: PlaygroundSectionData): PlaygroundNoteData {
  if (data.type !== "note") {
    throw new TypeError("The note renderer requires note data.");
  }
  return data;
}

function statusData(data: PlaygroundSectionData): PlaygroundStatusData {
  if (data.type !== "status") {
    throw new TypeError("The status renderer requires status data.");
  }
  return data;
}

function SampleNoteSection({ data }: SectionRenderProps<PlaygroundSectionData>) {
  const note = noteData(data);
  return (
    <WorkspaceInteractionBoundary preventExternalDrop>
      <p className="sample-section-copy">{note.body}</p>
    </WorkspaceInteractionBoundary>
  );
}

function SampleStatusSection({ data }: SectionRenderProps<PlaygroundSectionData>) {
  const status = statusData(data);
  return (
    <p className="sample-status">
      <strong className="sample-status__count">{status.count}</strong> <span>{status.label}</span>
    </p>
  );
}

export const playgroundSectionDefinitions = [
  {
    chrome: "default",
    creation: { group: "Basics", icon: "N", keywords: ["example", "note"] },
    defaultSize: { height: 320, width: 320 },
    defaultTitle: "Sample section",
    displayName: "Sample note",
    kind: "sample-note",
    render: SampleNoteSection,
  },
  {
    chrome: "compact",
    creation: { group: "Basics", icon: "S", keywords: ["counter", "progress", "status"] },
    defaultSize: { height: 200, width: 280 },
    defaultTitle: "Workspace status",
    displayName: "Status counter",
    kind: "sample-status",
    render: SampleStatusSection,
  },
] satisfies readonly SectionDefinition<PlaygroundSectionData>[];
