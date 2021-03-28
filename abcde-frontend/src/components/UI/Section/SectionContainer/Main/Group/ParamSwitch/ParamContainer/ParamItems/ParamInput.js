import { Input } from "@chakra-ui/react";
import { useState, useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function ParamInput(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameters: { name, defaultUIType, defaultVal },
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

  const [value, setValue] = useState(defaultVal);
  const [uiType, setUIType] = useState(defaultUIType);

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
      savedParam !== null && savedParam !== undefined ? savedParam : defaultVal
    );

    if (["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(uiType)) {
      addToVisibleSectionIdsThunk({
        name,
        parentId: sectionId,
        moduleName,
        objName,
        isList: uiType === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, moduleName, objName]);

  return (
    <Input
      type=""
      variant="flushed"
      placeholder={defaultVal}
      size="xs"
      maxWidth="10rem"
      value={value}
      onChange={(e) => sendState(name, e.target.value)}
    />
  );
}
