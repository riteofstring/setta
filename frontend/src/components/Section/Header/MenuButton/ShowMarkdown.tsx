import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_text_block_display_mode } from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";

export function RenderTextBlock({ sectionId }) {
  const { displayMode, format, implIsFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return {
      displayMode: impl.displayMode,
      format: impl.format,
      implIsFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  function onClick() {
    const newDisplayMode =
      displayMode === TextBlockDisplayModeEnum.render
        ? TextBlockDisplayModeEnum.edit
        : TextBlockDisplayModeEnum.render;

    route_set_text_block_display_mode({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      displayMode: newDisplayMode,
    });
  }

  return (
    <MenuItem onClick={onClick} disabled={implIsFrozen}>
      {displayMode === TextBlockDisplayModeEnum.edit
        ? `Render ${format}`
        : `Edit ${format}`}
    </MenuItem>
  );
}

export function ConvertFormat({ sectionId }) {
  const format = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return impl.format;
  });

  const convertTo =
    format === TextBlockFormatEnum.Plaintext
      ? TextBlockFormatEnum.Markdown
      : TextBlockFormatEnum.Plaintext;

  function onClick() {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
        format: convertTo,
      });
    });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return <MenuItem onClick={onClick}>{`Convert to ${convertTo}`}</MenuItem>;
}
