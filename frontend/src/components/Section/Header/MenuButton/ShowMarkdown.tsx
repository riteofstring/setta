import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  getEffectiveSectionImpl,
  getSectionImplLayering,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";

export function RenderTextBlock({ sectionId }) {
  const { displayMode, format, implIsFrozen } = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    if (impl.type !== SectionTypeEnum.TextBlock) {
      throw new Error();
    }
    return {
      displayMode: impl.displayMode,
      format: impl.format,
      implIsFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  function onClick() {
    useProjectState.setState((state) => {
      const implLayering = getSectionImplLayering(state, sectionId);
      if (implLayering.modifier.type !== SectionTypeEnum.TextBlock) {
        throw new Error();
      }
      implLayering.modifier.displayMode =
        displayMode === TextBlockDisplayModeEnum.render
          ? TextBlockDisplayModeEnum.edit
          : TextBlockDisplayModeEnum.render;
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
    const impl = getEffectiveSectionImpl(x, sectionId);
    if (impl.type !== SectionTypeEnum.TextBlock) {
      throw new Error();
    }
    return impl.format;
  });

  const convertTo =
    format === TextBlockFormatEnum.Plaintext
      ? TextBlockFormatEnum.Markdown
      : TextBlockFormatEnum.Plaintext;

  function onClick() {
    useProjectState.setState((state) => {
      const implLayering = getSectionImplLayering(state, sectionId);
      if (implLayering.modifier.type !== SectionTypeEnum.TextBlock) {
        throw new Error();
      }
      implLayering.modifier.format = convertTo;
    });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return <MenuItem onClick={onClick}>{`Convert to ${convertTo}`}</MenuItem>;
}
