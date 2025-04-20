import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { useSectionInfos } from "state/definitions";

export function HideColumn({ sectionId }) {
  const hideColumn = useSectionInfos((x) => x.x[sectionId].hideColumn);

  function onClick() {
    useSectionInfos.setState((x) => {
      x.x[sectionId].hideColumn = !hideColumn;
    });
  }

  return (
    <MenuItem onClick={onClick}>
      {hideColumn ? "Show Types" : "Hide Types"}
    </MenuItem>
  );
}
