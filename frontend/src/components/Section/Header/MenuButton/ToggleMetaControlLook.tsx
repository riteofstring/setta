import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_text_block_meta_control_style } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type ToggleMetaControlLookProps = {
  sectionId: string;
};

export function ToggleMetaControlLook({
  sectionId,
}: ToggleMetaControlLookProps) {
  const { metaControlStyle, isFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return {
      metaControlStyle: impl.metaControlStyle ?? false,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  function onClick() {
    const nextValue = !metaControlStyle;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          metaControlStyle: nextValue,
        });
      },
      send: (frontendOpId) =>
        route_set_text_block_meta_control_style({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          metaControlStyle: nextValue,
          frontendOpId,
        }),
    });
  }

  return (
    <MenuItem onClick={onClick} disabled={isFrozen}>
      <span
        className={
          metaControlStyle ? "text-blue-600 dark:text-blue-400" : undefined
        }
      >
        Transparent Section
      </span>
    </MenuItem>
  );
}
