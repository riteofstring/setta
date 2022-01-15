import { UIConfigDropdownAndFields } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import { useState } from "react";

export default function UiConfigGlobal() {
  const [currSelected, setCurrSelected] = useState(null);

  function onDropdownSelect(e) {
    setCurrSelected(e);
  }

  return (
    <UIConfigDropdownAndFields
      onDropdownSelect={onDropdownSelect}
      currSelected={currSelected}
    />
  );
}
