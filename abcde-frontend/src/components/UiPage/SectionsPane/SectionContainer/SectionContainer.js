import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionElements/SectionHeading";
import { Flex, HStack } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../../utils/useOnClickOutsideRef";
import SectionUI from "./SectionElements/SectionUI";
import NestedSection from "./NestedSection";
import {
  getTopLevelSectionId,
  getSectionOrder,
} from "../../../../utils/sectionIds";
import Breadcrumbs from "../SectionContainer/SectionElements/Breadcrumbs/Breadcrumbs";
import NestedIncrementer from "./SectionElements/NestedIncrementer";

const SectionContainer = ({
  sectionId,
  visibleSectionIds,
  theSection,
  depth,
}) => {
  const [focus, setFocus] = useState(false);

  const ref = useOnClickOutsideRef(() => setFocus(false));
  const { setActiveObj, setShiftAmount } = useStoreActions(
    (actions) => actions.master
  );
  const { shiftAmount } = useStoreState((state) => state.master);
  const { selected, activeObj, isList } = useStoreState(
    (state) => state.master
  );
  const {
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrParamsThunk,
    resetGlobalCurr: resetGlobalCurrParams,
  } = useStoreActions((actions) => actions.globalCurrParams);
  const {
    maybeSetGlobalCurrThunk: maybeSetGlobalCurrObjThunk,
    setCurrName: setCurrObjName,
    maybeResetCurrNameThunk: maybeResetCurrObjNameThunk,
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrObjsThunk,
    resetGlobalCurr: resetGlobalCurrObj,
  } = useStoreActions((actions) => actions.globalCurrObj);
  const {
    maybeResetCurrNameThunk: maybeResetCurrModuleNameThunk,
    maybeSetGlobalCurrThunk: maybeSetGlobalCurrModuleThunk,
    setCurrName: setCurrModuleName,
    maybeInitGlobalCurrThunk: maybeInitGlobalCurrModuleThunk,
    resetGlobalCurr: resetGlobalCurrModule,
  } = useStoreActions((actions) => actions.globalCurrModule);
  const {
    setCurrName: setCurrSectionName,
    setGlobalCurrThunk: setGlobalCurrSectionThunk,
  } = useStoreActions((actions) => actions.globalCurrSection);

  const applyFocus = () => {
    setActiveObj(sectionId);
    setFocus(true);
  };

  useEffect(() => {
    if (activeObj === sectionId) {
      setShiftAmount({
        sectionId: getTopLevelSectionId(sectionId),
        shiftAmount: depth,
      });
      setFocus(true);
      setCurrSectionName(sectionId);
      maybeResetCurrModuleNameThunk();
      maybeResetCurrObjNameThunk();
      maybeSetGlobalCurrObjThunk();
      maybeSetGlobalCurrModuleThunk();
      setGlobalCurrSectionThunk();
      if (selected[activeObj] && Object.keys(selected[activeObj]).length > 0) {
        maybeInitGlobalCurrModuleThunk();
        setCurrModuleName(selected[activeObj].moduleName);
        maybeInitGlobalCurrObjsThunk();
        setCurrObjName(selected[activeObj].name);
        maybeInitGlobalCurrParamsThunk();
      } else {
        resetGlobalCurrModule();
        resetGlobalCurrObj();
        resetGlobalCurrParams();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObj]);

  const maybeIncludeNestedIncrementer = () => {
    if (isList[sectionId]) {
      return <NestedIncrementer sectionId={sectionId} />;
    }
    return <></>;
  };

  return (
    <Flex
      direction="column"
      ml={depth === 0 && `${shiftAmount[sectionId] * -2.5}rem`}
      borderRadius="md"
    >
      <Flex
        width="100%"
        bg={focus ? "gray.50" : "white"}
        onClick={() => applyFocus()}
        ref={ref}
        direction="column"
        padding="1rem 1.25rem"
        my="0.5rem"
        borderRadius="md"
        border="1px"
        borderColor="gray.200"
        id={sectionId}
      >
        {getTopLevelSectionId(activeObj) === sectionId && <Breadcrumbs />}
        <HStack mb="1rem">
          <SectionHeading heading={theSection.name} />
          {maybeIncludeNestedIncrementer()}
        </HStack>

        <SectionUI
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={theSection}
        />
      </Flex>
      {Object.keys(visibleSectionIds).length > 0 &&
        getSectionOrder(visibleSectionIds).map((e, idx) => (
          <NestedSection
            sectionId={sectionId}
            visibleSectionIds={visibleSectionIds}
            e={e}
            idx={idx}
            key={`Nested-Sec-${e}-${idx}`}
            depth={depth + 1}
          />
        ))}
    </Flex>
  );
};

export default React.memo(SectionContainer);
