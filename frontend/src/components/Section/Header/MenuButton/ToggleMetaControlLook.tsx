import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { setTextBlockMetaControlStyle } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
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
        callOpenAPI(
          setTextBlockMetaControlStyle({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              metaControlStyle: nextValue,
              frontendOpId,
            },
          } as Parameters<typeof setTextBlockMetaControlStyle>[0]),
        ),
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
