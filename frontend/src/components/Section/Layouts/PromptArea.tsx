import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";

export function PromptArea({ sectionId }: { sectionId: string }) {
  const { renderedText, renderError, missingVariables } = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Prompt,
      );
      return {
        renderedText: impl.renderedText,
        renderError: impl.renderError,
        missingVariables: impl.missingVariables,
      };
    },
  );
  const { ref, isScrollable } = useIsScrollable();
  const errorText =
    renderError ||
    (missingVariables.length > 0
      ? `Missing variables: ${missingVariables.join(", ")}`
      : "");
  const wrapperClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-main -mt-1 nodrag ${
    isScrollable ? "nowheel" : ""
  } -mr-[13px] pr-4 mb-3 ml-1 cursor-auto select-text overflow-y-scroll`;

  return (
    <div className={`${NO_PAN_CLASS_NAME} section-main-full-w flex flex-col`}>
      {errorText ? (
        <div className="mx-3 mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {errorText}
        </div>
      ) : null}
      <pre
        ref={ref}
        className={`${wrapperClassName} whitespace-pre-wrap break-words text-xs text-setta-700 dark:text-setta-300`}
      >
        {renderedText || "No prompt rendered yet."}
      </pre>
    </div>
  );
}
