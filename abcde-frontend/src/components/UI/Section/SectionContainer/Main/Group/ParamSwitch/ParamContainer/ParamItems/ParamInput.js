import { Input } from "@chakra-ui/react";
import { useState, useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function ParamInput(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameters: { name, ui_type, default_val },
    isListRoot,
  } = props;

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

  return (
    <Input
      type=""
      variant="flushed"
      placeholder={default_val}
      size="xs"
      maxWidth="10rem"
      value={value}
      onChange={(e) => sendState(name, e.target.value)}
    />
  );
}
