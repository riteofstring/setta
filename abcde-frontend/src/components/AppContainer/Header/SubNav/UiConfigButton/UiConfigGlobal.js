import { Box, Button, HStack, List, ListItem } from "@chakra-ui/react";
import { UIConfigDropdownAndFields } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import { useStoreActions, useStoreState } from "easy-peasy";
import { getNewUIType } from "hooks/useUIType";
import React, { useState } from "react";
import { checkboxChangeFn } from "utils/utils";

export default function UiConfigGlobal() {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);

  const setManyUITypeIds = useStoreActions(
    (x) => x.projectParamDefaults.setManyUITypeIds
  );
  const [currSelected, setCurrSelected] = useState(null);
  const [params, setParams] = useState([]);

  function onDropdownSelect(e) {
    setCurrSelected(e);
  }

  function onCheckboxChange(newStateFn) {
    setParams(newStateFn);
  }

  function onApply() {
    const uiType = getNewUIType({ name: currSelected, isDefault: true });
    const paramIdToUITypeId = _.zipObject(
      params,
      _.fill(Array(params.length), { uiTypeId: uiType.id })
    );
    setUIType({ uiType });
    setManyUITypeIds({ paramIdToUITypeId });
  }

  return (
    <HStack>
      <UIConfigDropdownAndFields
        onDropdownSelect={onDropdownSelect}
        currSelected={currSelected}
      />
      <Box maxHeight="500px" overflowY="auto">
        <ParameterList onCheckboxChange={onCheckboxChange} />
      </Box>
      <Button variant="outline" size="sm" onClick={onApply}>
        Apply
      </Button>
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
