import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import ObjectMenu from "./ObjectMenu/ObjectMenu";
import {
  HStack,
  Flex,
  Heading,
  Menu,
  Box,
  Button,
  Spacer,
} from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../utils/useOnClickOutsideRef";
import ObjectMenuButton from "./ObjectMenuButton/ObjectMenuButton";
import { getSection, combineIds } from "../../../utils/sectionIds";

import { FiCornerDownRight } from "react-icons/fi";

const ObjectContainer = ({ sectionId, visibleSectionIds, theSection }) => {
  const [focus, setFocus] = useState(false);
  const [visible, setVisible] = useState(true);
  const flipVisible = () => {
    setVisible(!visible);
  };

  const { sections } = useStoreState((state) => state.master);

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
    <Flex direction="column">
      <Flex
        width="100%"
        bg={focus ? "gray.50" : "white"}
        onClick={() => setFocus(true)}
        ref={ref}
        direction="column"
        padding="2.5rem"
        borderRadius="md"
      >
        <Heading as="h2" size="xl" mb="0.5rem" w="100%">
          {theSection.name}
        </Heading>

        <HStack spacing="2rem" w="100%">
          <Menu>
            <ObjectMenuButton sectionId={sectionId} theSection={theSection} />
            <ObjectMenu sectionId={sectionId} theSection={theSection} />
          </Menu>
          <Spacer />
          {Object.keys(visibleSectionIds).length > 0 && (
            <Button onClick={flipVisible}>
              {!!visible ? "Collapse" : "Show"}
            </Button>
          )}
        </HStack>
      </Flex>
      {Object.keys(visibleSectionIds).length > 0 &&
        Object.keys(visibleSectionIds).map((e, idx) => (
          <Flex
            mt="0rem"
            ml="2.5rem"
            display={!visible ? "none" : "inherit"}
            key={`nest-flex-${e}-${idx}`}
          >
            <Box mt="0" mr=".5rem" key={`ic-con-${e}-${idx}`}>
              <FiCornerDownRight
                size="2.4rem"
                color="#CBD5E0"
                key={`icon-${e}-${idx}`}
              />
            </Box>
            <ObjectContainer
              sectionId={combineIds(sectionId, e)}
              visibleSectionIds={visibleSectionIds[e]}
              theSection={getSection(sections, combineIds(sectionId, e))}
              key={`${e}-${idx}`}
            />
          </Flex>
        ))}
    </Flex>
  );
};

export default React.memo(ObjectContainer);
