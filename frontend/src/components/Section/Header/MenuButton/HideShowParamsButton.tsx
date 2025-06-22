import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  getEffectiveSectionImpl,
  getSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export function HideShowParamsButton({ sectionId }) {
  const { hasParams, hideParams } = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    if (impl.type !== SectionTypeEnum.Callable) {
      throw new Error();
    }
    return { hasParams: false, hideParams: impl.hideParams };
  }, _.isEqual);

  function onClick() {
    useProjectState.setState((state) => {
      const impl = getSectionImpl(state, sectionId);
      if (impl.type !== SectionTypeEnum.Callable) {
        throw new Error();
      }
      impl.hideParams = !hideParams;
    });
  }

  return (
    !hasParams && (
      <MenuItem onClick={onClick}>
        {hideParams ? "Show Params" : "Hide Params"}
      </MenuItem>
    )
  );
}
