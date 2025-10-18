import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { useProjectState } from "state/definitions";

export function HideColumn({ sectionId }) {
  const hideColumn = useProjectState((x) => x.sections[sectionId].hideColumn);

  function onClick() {
    useProjectState.setState((x) => {
      x.sections[sectionId].hideColumn = !hideColumn;
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {hideColumn ? "Show Types" : "Hide Types"}
    </MenuItem>
  );
}
