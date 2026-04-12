import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { setTextBlockDisplayMode } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { HiOutlineDocumentText, HiOutlinePencil } from "react-icons/hi";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
} from "utils/generatedTypes";
type ToggleTextBlockDisplayModeButtonProps = {
  sectionId: string;
};
export function ToggleTextBlockDisplayModeButton({
  sectionId,
}: ToggleTextBlockDisplayModeButtonProps) {
  const { textDisplayMode, format, implIsFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return {
      textDisplayMode: impl.textDisplayMode,
      format: impl.format,
      implIsFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const { canEditLayout } = useShareCapabilities();
  const isDisabled = implIsFrozen || !canEditLayout;
  const isRenderMode = textDisplayMode === TextBlockDisplayModeEnum.Render;
  const nextDisplayMode = isRenderMode
    ? TextBlockDisplayModeEnum.Edit
    : TextBlockDisplayModeEnum.Render;
  function onClick() {
    if (isDisabled) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          textDisplayMode: nextDisplayMode,
        });
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setTextBlockDisplayMode({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              textDisplayMode: nextDisplayMode,
              frontendOpId,
            },
          } as Parameters<typeof setTextBlockDisplayMode>[0]),
        ),
    });
  }
  const label = `${nextDisplayMode} ${format}`;
  const icon = isRenderMode ? (
    <HiOutlinePencil className="h-3 w-3" />
  ) : (
    <HiOutlineDocumentText className="h-3 w-3" />
  );
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
      className={`nodrag flex inline-flex items-center justify-center focus-visible:ring-2 ${backgroundClassName} ${colorClassName} ${cursorClassName} mr-1 h-4 w-4 rounded-full p-0`}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      {...getFloatingBoxHandlers({ title: label })}
    >
      {icon}
    </button>
  );
}
