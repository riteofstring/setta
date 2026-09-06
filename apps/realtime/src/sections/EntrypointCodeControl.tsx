import {
  WorkspaceSectionHeaderAction,
  type WorkspaceCodeSectionData,
  type WorkspaceSection,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import type { Project } from "../backend/generatedContract";
import type { RuntimeSourceViewState } from "../app/runtimeContext";

function ApplySourceIcon({ busy }: { busy: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={busy ? "realtime-source-action-busy" : undefined}
      fill="none"
      height="12"
      viewBox="0 0 16 16"
      width="12"
    >
      <path
        d="M13 5.25V2.5m0 0h-2.75M13 2.5l-2.1 2.1A5 5 0 1 0 13 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function sourceIsAvailable(
  source: RuntimeSourceViewState,
  project: Project,
): boolean {
  return (
    source.document !== null &&
    source.document.projectId === project.id &&
    source.document.entrypoint === project.runtime.entrypoint
  );
}

function codeDraftIsDirty(
  data: WorkspaceCodeSectionData,
  source: RuntimeSourceViewState,
): boolean {
  return source.document !== null && data.code !== source.document.source;
}

function sourceActionDisabled(
  section: WorkspaceSection,
  data: WorkspaceCodeSectionData,
  source: RuntimeSourceViewState,
  project: Project,
  dirty: boolean,
): boolean {
  return (
    section.positionAndSizeLocked ||
    data.mode !== "editable" ||
    !sourceIsAvailable(source, project) ||
    source.status !== "ready" ||
    (!dirty && !source.activationRejected)
  );
}

export function EntrypointCodeControl({
  section,
}: {
  section: WorkspaceSection;
}) {
  const { actions, project, source } = useRealtime();
  const data = section.data as WorkspaceCodeSectionData;
  const applying = source.status === "applying";
  const label = applying ? "Applying and reloading" : "Apply & reload";
  const dirty = codeDraftIsDirty(data, source);
  const disabled = sourceActionDisabled(section, data, source, project, dirty);
  const actionLabel = "Apply & reload";
  return (
    <span data-runtime-source-dirty={dirty ? "true" : "false"}>
      <WorkspaceSectionHeaderAction
        busy={applying}
        disabled={disabled}
        hasSectionStyleTheme={section.styleColor !== null}
        label={label}
        onClick={() => void actions.applyRuntimeSource(section.id, data.code)}
        tooltip={applying ? label : `${actionLabel} (Ctrl/⌘+Enter)`}
      >
        <ApplySourceIcon busy={applying} />
      </WorkspaceSectionHeaderAction>
    </span>
  );
}
