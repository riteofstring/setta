import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ObjectMenu from "./ObjectMenu/ObjectMenu";
import { HStack, VStack, Heading, Menu, Box } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../utils/useOnClickOutsideRef";
import ObjectMenuButton from "./ObjectMenuButton/ObjectMenuButton";

import { FiCornerDownRight } from "react-icons/fi";

const ObjectContainer = ({ sectionId, theSection }) => {
  const [focus, setFocus] = useState(false);
  const ref = useOnClickOutsideRef(() => setFocus(false));
  const { setActiveObj } = useStoreActions((actions) => actions.master);
  const { selected, activeObj } = useStoreState((state) => state.master);
  const {
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrParamsThunk,
  } = useStoreActions((actions) => actions.globalCurrParams);
  const {
    maybeSetGlobalCurrThunk: maybeSetGlobalCurrObjThunk,
    setCurrName: setCurrObjName,
    maybeResetCurrNameThunk: maybeResetCurrObjNameThunk,
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrObjsThunk,
  } = useStoreActions((actions) => actions.globalCurrObj);
  const {
    maybeResetCurrNameThunk: maybeResetCurrModuleNameThunk,
    maybeSetGlobalCurrThunk: maybeSetGlobalCurrModuleThunk,
    setCurrName: setCurrModuleName,
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrModuleThunk,
  } = useStoreActions((actions) => actions.globalCurrModule);
  const {
    setCurrName: setCurrSectionName,
    setGlobalCurrThunk: setGlobalCurrSectionThunk,
  } = useStoreActions((actions) => actions.globalCurrSection);

  useEffect(() => {
    if (focus) {
      setActiveObj(sectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    if (activeObj === sectionId) {
      // console.log("INSIDE", selected[activeObj]);
      setCurrSectionName(sectionId);
      maybeResetCurrModuleNameThunk();
      maybeResetCurrObjNameThunk();
      maybeSetGlobalCurrObjThunk();
      maybeSetGlobalCurrModuleThunk();
      setGlobalCurrSectionThunk();
      if (selected[activeObj] && Object.keys(selected[activeObj]).length > 0) {
        // console.log("REALLY INSIDE", selected[activeObj]);
        maybeInitGlobalCurrModuleThunk();
        setCurrModuleName(selected[activeObj].moduleName);
        maybeInitGlobalCurrObjsThunk();
        setCurrObjName(selected[activeObj].name);
        maybeInitGlobalCurrParamsThunk();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObj]);

  return (
    <HStack
      // marginLeft={depth > 1 && `${depth * 3}rem`}
      mt="2rem"
    >
      {/* {depth > 0 && <Box mr="2rem"><FiCornerDownRight size="3rem" color="#CBD5E0" /></Box>} */}
      <VStack
        spacing="1rem"
        width="100%"
        bg={focus ? "gray.50" : "white"}
        onClick={() => setFocus(true)}
        ref={ref}
      >
        <Heading as="h2" size="xl" w="100%">
          {theSection.name}
        </Heading>

        <HStack spacing="2rem" w="100%">
          <Menu>
            <ObjectMenuButton sectionId={sectionId} theSection={theSection} />
            <ObjectMenu sectionId={sectionId} theSection={theSection} />
          </Menu>
        </HStack>
      </VStack>
    </HStack>
  );
};

export default React.memo(ObjectContainer);
