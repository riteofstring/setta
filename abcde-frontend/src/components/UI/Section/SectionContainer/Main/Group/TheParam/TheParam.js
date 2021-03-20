import { Text, HStack, Input, Spacer, FormLabel } from "@chakra-ui/react";
import ParamSweepButton from "./ParamSweepUI/ParamSweepButton";
import PinButton from "./PinButton/PinButton";
import React, { useState, useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TheParam({
  sectionId,
  moduleName,
  objName,
  parameters,
  idx,
}) {
  const { name, ui_type, default_val } = parameters;

  const setCurrParam = useStoreActions(
    (actions) => actions.globalCurr.setCurrParam
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const globalCurr = useStoreState(
    (state) => state.globalCurr.globalCurr,
    (prev, next) => checkGlobalCurrEquality(prev, next)
  );
  const isListRoot = useStoreState(
    (state) => state.master.isListRoot[sectionId]
  );

  const [value, setValue] = useState(default_val);

  const checkGlobalCurrEquality = (prev, next) => {
    let prevParam = null;
    let nextParam = null;
    try {
      prevParam = prev[sectionId][moduleName][objName][name];
    } catch (err) {}
    try {
      nextParam = next[sectionId][moduleName][objName][name];
    } catch (err) {}
    return prevParam === nextParam;
  };

  const sendState = (name, value) => {
    setValue(value);
    setCurrParam({
      sectionId,
      moduleName,
      objName,
      paramName: name,
      paramValue: value,
    });
  };

  useLayoutEffect(() => {
    let savedParam = null;

    try {
      savedParam = globalCurr[sectionId][moduleName][objName][name];
    } catch (err) {}

    setValue(
      savedParam !== null && savedParam !== undefined ? savedParam : default_val
    );

    if (
      !isListRoot &&
      ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(ui_type)
    ) {
      addToVisibleSectionIdsThunk({
        name,
        parentId: sectionId,
        moduleName,
        objName,
        isList: ui_type === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, moduleName, objName]);

  const tempKwargs = "KWARGS";
  // switch (ui_type) {
  switch (tempKwargs) {
    case "KWARGS":
      return (
        <HStack>
          <Input
            type=""
            variant="flushed"
            placeholder={default_val}
            size="xs"
            maxWidth="10rem"
            value={value}
            onChange={(e) => sendState(name, e.target.value)}
          />
          <Spacer />
          <Input
            type=""
            variant="flushed"
            placeholder={default_val}
            size="xs"
            maxWidth="10rem"
            value={value}
            onChange={(e) => sendState(name, e.target.value)}
          />
        </HStack>
      );
    default:
      return (
        <HStack>
          <FormLabel>
            <Text fontSize="sm" fontWeight="semibold" color="gray.700">
              {name}
            </Text>
          </FormLabel>
          <Spacer />
          <Input
            type=""
            variant="flushed"
            placeholder={default_val}
            size="xs"
            maxWidth="10rem"
            value={value}
            onChange={(e) => sendState(name, e.target.value)}
          />
        </HStack>
      );
  }
}
