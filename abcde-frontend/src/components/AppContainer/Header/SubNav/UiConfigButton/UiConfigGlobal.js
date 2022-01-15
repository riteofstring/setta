import { HStack, List, ListItem } from "@chakra-ui/react";
import { UIConfigDropdownAndFields } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import { useStoreState } from "easy-peasy";
import { useState } from "react";

export default function UiConfigGlobal() {
  const [currSelected, setCurrSelected] = useState(null);

  function onDropdownSelect(e) {
    setCurrSelected(e);
  }

  return (
    <HStack>
      <UIConfigDropdownAndFields
        onDropdownSelect={onDropdownSelect}
        currSelected={currSelected}
      />
      <ParameterList />
    </HStack>
  );
}

function InfoList({ info, m = 0 }) {
  return (
    <List m={m}>
      {_.values(info).map((x, idx) => (
        <ListItem key={`${x.name}-${idx}`}>
          <>
            {x.name}
            {x.children && <InfoList info={x.children} m={m + 5} />}
          </>
        </ListItem>
      ))}
    </List>
  );
}

function ParameterList() {
  const info = useStoreState((x) => x.master.allPackageInfo.children);
  return <InfoList info={info} />;
}
