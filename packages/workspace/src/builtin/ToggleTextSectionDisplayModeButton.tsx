import { HiOutlineDocumentText, HiOutlinePencil } from "react-icons/hi";
import { useWorkspaceCapabilities } from "../document/capabilities";
import type { WorkspaceSection } from "../document/types";
import { useWorkspaceHost } from "../workspaceHostContext";
import { getWorkspaceTooltipHandlers } from "../tooltip/WorkspaceTooltip";
import {
  getWorkspaceTextSectionData,
  setWorkspaceTextSectionData,
} from "./textSectionActions";
import {
  parseWorkspaceTextSectionData,
  type WorkspaceTextSectionChoices,
  type WorkspaceTextSectionDisplayMode,
  type WorkspaceTextSectionFormat,
} from "./textSectionData";

const FORMAT_LABELS: Record<WorkspaceTextSectionFormat, string> = {
  plaintext: "text",
  markdown: "Markdown",
};

const DISPLAY_MODE_LABELS: Record<WorkspaceTextSectionDisplayMode, string> = {
  edit: "Edit",
  render: "Render",
};

export function ToggleTextSectionDisplayModeButton({
  choices,
  section,
}: {
  choices: WorkspaceTextSectionChoices;
  section: WorkspaceSection;
}) {
  const host = useWorkspaceHost();
  const canEditLayout = useWorkspaceCapabilities((x) => x.canEditLayout);
  const { displayMode, format } = parseWorkspaceTextSectionData(
    section.id,
    section.data,
    choices,
  );
  const isRenderMode = displayMode === "render";
  const nextDisplayMode: WorkspaceTextSectionDisplayMode = isRenderMode
    ? "edit"
    : "render";
  const isDisabled = !canEditLayout || section.positionAndSizeLocked;
  const label = `${DISPLAY_MODE_LABELS[nextDisplayMode]} ${FORMAT_LABELS[format]}`;

  function onClick() {
    if (isDisabled) {
      return;
    }
    setWorkspaceTextSectionData(host, section.id, {
      ...getWorkspaceTextSectionData(host, section.id),
      displayMode: nextDisplayMode,
    });
  }

  const backgroundClassName = isRenderMode
    ? "bg-transparent"
    : "hover:bg-blue-500";
  const colorClassName = isRenderMode
    ? "text-setta-600 hover:!text-blue-500"
    : "text-blue-500 hover:!text-cyan-200";
  const cursorClassName = isDisabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-pointer";

  return (
    <button
      aria-label={label}
      className={`nodrag flex inline-flex items-center justify-center focus-visible:ring-2 ${backgroundClassName} ${colorClassName} ${cursorClassName} me-1 h-4 w-4 rounded-full p-0`}
      data-setta-workspace-touch-target="compact"
      disabled={isDisabled}
      onClick={onClick}
      title={label}
      type="button"
      {...getWorkspaceTooltipHandlers(host, { content: label })}
    >
      {isRenderMode ? (
        <HiOutlinePencil aria-hidden="true" className="h-3 w-3" />
      ) : (
        <HiOutlineDocumentText aria-hidden="true" className="h-3 w-3" />
      )}
    </button>
  );
}
