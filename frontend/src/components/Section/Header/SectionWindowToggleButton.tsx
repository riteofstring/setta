import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import { MdFlipToFront, MdOpenInNew } from "react-icons/md";
import { showSectionInProjectChatWindow } from "state/actions/projectChatWindowing";
import { bootProjectChatWindowToCanvasSection } from "state/actions/projectChatWindowingCanvasBoot";
import { getOpenExternalProjectChatWindowInstanceForSectionInState } from "state/actions/projectChatWindowingSelectors";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";

const SECTION_HEADER_WINDOW_BUTTON_CLASS =
  "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-500 transition focus-visible:ring-2 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100";
const SECTION_HEADER_WINDOW_BUTTON_THEMED_CLASS =
  "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:ring-[var(--setta-section-style-outline)] text-[color:var(--setta-section-style-muted-text)] hover:bg-setta-100 hover:text-[color:var(--setta-section-style-outline)] dark:hover:bg-setta-800";

function supportsSectionWindowing(
  sectionTypeName: SectionType,
  isRoot: boolean,
): boolean {
  if (isRoot) {
    return false;
  }
  return (
    sectionTypeName !== SectionTypeEnum.Group &&
    sectionTypeName !== SectionTypeEnum.ListRoot &&
    sectionTypeName !== SectionTypeEnum.MetaControl
  );
}

type SectionWindowToggleButtonProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
};

export function SectionWindowToggleButton({
  sectionId,
  sectionTypeName,
  isRoot,
  hasSectionStyleTheme,
}: SectionWindowToggleButtonProps) {
  const { canEditLayout } = useShareCapabilities();
  const externalizedWindowInstance = useProjectState((state) =>
    getOpenExternalProjectChatWindowInstanceForSectionInState(
      state.projectChatWindowing,
      sectionId,
    ),
  );

  if (!canEditLayout || !supportsSectionWindowing(sectionTypeName, isRoot)) {
    return null;
  }

  const className = hasSectionStyleTheme
    ? SECTION_HEADER_WINDOW_BUTTON_THEMED_CLASS
    : SECTION_HEADER_WINDOW_BUTTON_CLASS;

  if (externalizedWindowInstance) {
    const showInCanvasLabel = getWindowControlQuickInfoText({
      action: "show_section_in_canvas",
    });

    return (
      <button
        type="button"
        aria-label={showInCanvasLabel}
        title={showInCanvasLabel}
        className={className}
        onClick={() => {
          void bootProjectChatWindowToCanvasSection(
            externalizedWindowInstance.instanceId,
          );
        }}
        data-testid="section-window-toggle"
        data-section-id={sectionId}
        {...getWindowControlQuickInfoHandlers({
          action: "show_section_in_canvas",
        })}
      >
        <MdFlipToFront size={12} />
      </button>
    );
  }

  const openInWindowLabel = getWindowControlQuickInfoText({
    action: "open_section_in_window",
  });

  return (
    <button
      type="button"
      aria-label={openInWindowLabel}
      title={openInWindowLabel}
      className={className}
      onClick={() => {
        showSectionInProjectChatWindow(sectionId);
      }}
      data-testid="section-window-toggle"
      data-section-id={sectionId}
      {...getWindowControlQuickInfoHandlers({
        action: "open_section_in_window",
      })}
    >
      <MdOpenInNew size={12} />
    </button>
  );
}
