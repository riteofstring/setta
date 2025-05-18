import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { useProjectState } from "state/definitions";

export function HideShowUnpinnedParamsButton({ sectionId }) {
  const hideUnpinnedParams = useProjectState(
    (x) => x.sections[sectionId].hideUnpinnedParams,
  );

  function onClick() {
    useProjectState.setState((state) => {
      state.sections[sectionId].hideUnpinnedParams = !hideUnpinnedParams;
    });
  }

  // only show this option if there are no parameters
  // and the search bar isn't hidden (we don't want to hide both params and search)
  return (
    <MenuItem onClick={onClick}>
      {hideUnpinnedParams ? "Show Unpinned Params" : "Hide Unpinned Params"}
    </MenuItem>
  );
}
