import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionHeading";
import { Flex } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../utils/useOnClickOutsideRef";
import SectionUI from "./SectionUI";
import NestedSection from "./NestedSection";

const SectionContainer = ({ sectionId, visibleSectionIds, theSection, depth }) => {
  const [focus, setFocus] = useState(false);

  const ref = useOnClickOutsideRef(() => setFocus(false));
  const { setActiveObj } = useStoreActions((actions) => actions.master);
  const { selected, activeObj } = useStoreState((state) => state.master);
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

  useEffect(() => {
    if (focus) {
      setActiveObj(sectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    if (activeObj === sectionId) {
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

  return (
    <Flex direction="column">
      <Flex
        width="100%"
        bg={focus ? "gray.50" : "white"}
        onClick={() => setFocus(true)}
        ref={ref}
        direction="column"
        padding="1.25rem"
        borderRadius="md"
      >
        <SectionHeading heading={theSection.name} />
        <SectionUI
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={theSection}
        />
      </Flex>
      {Object.keys(visibleSectionIds).length > 0 &&
        Object.keys(visibleSectionIds).map((e, idx) => (
          <NestedSection
            sectionId={sectionId}
            visibleSectionIds={visibleSectionIds}
            e={e}
            idx={idx}
            key={`Nested-Sec-${e}-${idx}`}
            depth={depth+1}
          />
        ))}
    </Flex>
  );
};

export default React.memo(SectionContainer);
