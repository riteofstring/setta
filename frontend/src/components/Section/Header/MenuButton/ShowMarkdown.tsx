import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_set_text_block_display_mode,
  route_set_text_block_format,
} from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";

export function RenderTextBlock({ sectionId }: { sectionId: string }) {
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

  const newDisplayMode =
    textDisplayMode === TextBlockDisplayModeEnum.Render
      ? TextBlockDisplayModeEnum.Edit
      : TextBlockDisplayModeEnum.Render;

  function onClick() {
    if (isDisabled) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          textDisplayMode: newDisplayMode,
        });
      },
      send: (frontendOpId) =>
        route_set_text_block_display_mode({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          textDisplayMode: newDisplayMode,
          frontendOpId,
        }),
    });
  }

  return (
    <MenuItem onClick={onClick} disabled={isDisabled}>
      {`${newDisplayMode} ${format}`}
    </MenuItem>
  );
}

export function ConvertFormat({ sectionId }: { sectionId: string }) {
  const format = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return impl.format;
  });
  const { canEditLayout } = useShareCapabilities();
  const isDisabled = !canEditLayout;

  const convertTo =
    format === TextBlockFormatEnum.Plaintext
      ? TextBlockFormatEnum.Markdown
      : TextBlockFormatEnum.Plaintext;

  function onClick() {
    if (isDisabled) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          format: convertTo,
        });
      },
      send: (frontendOpId) =>
        route_set_text_block_format({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          format: convertTo,
          frontendOpId,
        }),
    });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick} disabled={isDisabled}>
      {`Convert to ${convertTo}`}
    </MenuItem>
  );
}
