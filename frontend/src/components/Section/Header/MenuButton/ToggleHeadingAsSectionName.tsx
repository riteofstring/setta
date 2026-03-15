import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_text_block_heading_as_section_name } from "utils/generatedEndpoints";
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
        route_set_text_block_heading_as_section_name({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          headingAsSectionName: nextValue,
          frontendOpId,
        }),
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
