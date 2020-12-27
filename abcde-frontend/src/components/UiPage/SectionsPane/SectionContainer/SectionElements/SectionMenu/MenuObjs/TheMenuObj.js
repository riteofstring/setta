import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { Box, useRadio } from "@chakra-ui/react";

const TheMenuObj = (props) => {
  const { sectionId, moduleName, objName } = props;
  const sectionHasNested = useStoreState(
    (state) => state.master.sectionHasNested[sectionId]
  );
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteChildrenFromVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.deleteChildrenFromVisibleSectionIdsThunk
  );
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);

  const { getInputProps, getCheckboxProps } = useRadio(props);
  const input = getInputProps();
  const checkbox = getCheckboxProps();

  const setSelectedAndCurrObj = () => {
    if (sectionHasNested) {
      deleteChildrenFromVisibleSectionIdsThunk({
        sectionId,
        moduleName,
        objName,
      });
    }
    setCurr({ moduleName, objName });
    setSelected({ sectionId, moduleName, name: objName });
  };

  return (
    <Box as="label">
      <input {...input} />
      <Box
        {...checkbox}
        cursor="pointer"
        _checked={{
          bg: "teal.600",
          color: "white",
          borderColor: "teal.600",
        }}
        _focus={{
          boxShadow: "outline",
        }}
        px={5}
        py={3}
        onClick={() => setSelectedAndCurrObj()}
        onMouseEnter={() => {}}
      >
        {objName}
      </Box>
    </Box>
  );
};

export default React.memo(TheMenuObj);
