import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { setTextBlockHeadingAsSectionName } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
type ToggleHeadingAsSectionNameProps = {
  sectionId: string;
};
export function ToggleHeadingAsSectionName({
  sectionId,
}: ToggleHeadingAsSectionNameProps) {
  const { headingAsSectionName, isFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return {
      headingAsSectionName: impl.headingAsSectionName ?? false,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  function onClick() {
    const nextValue = !headingAsSectionName;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
          headingAsSectionName: nextValue,
        });
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setTextBlockHeadingAsSectionName({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              headingAsSectionName: nextValue,
              frontendOpId,
            },
          } as Parameters<typeof setTextBlockHeadingAsSectionName>[0]),
        ),
    });
  }
  const textClassName = headingAsSectionName
    ? "text-blue-600 dark:text-blue-400"
    : undefined;
  return (
    <MenuItem onClick={onClick} disabled={isFrozen}>
      <span className={textClassName}>Heading as Section Name</span>
    </MenuItem>
  );
}
