import { HStack, List, ListItem } from "@chakra-ui/react";
import { UIConfigDropdownAndFields } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import { useStoreState } from "easy-peasy";
import React, { useState } from "react";
import { checkboxChangeFn } from "utils/utils";

export default function UiConfigGlobal() {
  const [currSelected, setCurrSelected] = useState(null);
  const [params, setParams] = useState([]);

  console.log("selected params", params);

  function onDropdownSelect(e) {
    setCurrSelected(e);
  }

  function onCheckboxChange(newStateFn) {
    setParams(newStateFn);
  }

  return (
    <HStack>
      <UIConfigDropdownAndFields
        onDropdownSelect={onDropdownSelect}
        currSelected={currSelected}
      />
      <ParameterList onCheckboxChange={onCheckboxChange} />
    </HStack>
  );
}

function ParameterList(props) {
  const info = useStoreState((x) => x.master.allPackageInfo.children);
  return <InfoList info={info} {...props} />;
}

function InfoList({ info, m = 0, ...props }) {
  return (
    <List m={m}>
      {_.values(info).map((x, idx) => (
        <ListItem key={`${x.name}-${idx}`}>
          <>
            {x.children ? (
              <HigherItem x={x} m={m} {...props} />
            ) : (
              <ParameterItem x={x} {...props} />
            )}
          </>
        </ListItem>
      ))}
    </List>
  );
}

function HigherItem({ x, m, ...props }) {
  return (
    <>
      {x.name}
      <InfoList info={x.children} m={m + 5} {...props} />
    </>
  );
}

function _ParameterItem({ x, onCheckboxChange }) {
  function onChange(e) {
    onCheckboxChange(checkboxChangeFn(e, x.id));
  }
  return <ClickableDiv onClick={onChange}>{x.name}</ClickableDiv>;
}

const ParameterItem = React.memo(_ParameterItem, (p, n) => p.x.id === n.x.id);

function ClickableDiv({ onClick, children }) {
  const [isSelected, setIsSelected] = useState(false);

  function _onClick() {
    const newIsSelected = !isSelected;
    setIsSelected(newIsSelected);
    onClick({ target: { checked: newIsSelected } });
  }

  return (
    <div
      onClick={_onClick}
      style={{
        backgroundColor: isSelected ? "grey" : "white",
      }}
    >
      {children}
    </div>
  );
}
