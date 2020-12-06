import React, { useState } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionElements/SectionHeading";
import { Flex, HStack } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../../utils/useOnClickOutsideRef";
import SectionUI from "./SectionElements/SectionUI";
import NestedSection from "./NestedSection";
import { getTopLevelSectionId } from "../../../../utils/sectionIds";
import Breadcrumbs from "../SectionContainer/SectionElements/Breadcrumbs/Breadcrumbs";
import NestedIncrementer from "./SectionElements/NestedIncrementer";

const SectionContainer = ({
  sectionId,
  visibleSectionIds,
  theSection,
  depth,
}) => {
  // const [focus, setFocus] = useState(false);

  // const ref = useOnClickOutsideRef(() => setFocus(false));
  const setActiveObj = useStoreActions(
    (actions) => actions.master.setActiveObj
  );
  // const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  // const { sectionId: prevSectionId } = useStoreState(
  //   (state) => state.globalCurr
  // );
  // const { selected, isList, shiftAmount } = useStoreState(
  //   (state) => state.master
  // );
  const activeObj = useStoreState((state) => state.master.activeObj);

  // const setInFocus = useStoreActions((actions) => actions.master.setInFocus);
  // const inFocus = useStoreState(
  //   (state) => state.master.inFocus,
  //   (prev, next) => prev[sectionId] === next[sectionId]
  // );

  console.log("sectionContainer");

  const applyFocus = () => {
    setActiveObj(sectionId);
    console.log("focus");
    // setInFocus(sectionId);
    // setCurr({ sectionId, moduleName: null, objName: null });
    // setFocus(true)
    // //     // setShiftAmount({
    // //     //   sectionId: getTopLevelSectionId(sectionId),
    // //     //   shiftAmount: depth,
    // //     // });
    // const thisSelected = selected[sectionId]
    // if (sectionId !== prevSectionId && thisSelected) {
    //   const { moduleName, name: objName } = thisSelected;
    //   setCurr({ sectionId, moduleName, objName });
    // }
  };

  // const maybeIncludeNestedIncrementer = () => {
  //   if (isList[sectionId]) {
  //     return <NestedIncrementer sectionId={sectionId} />;
  //   }
  //   return <></>;
  // };

  return (
    <>
      <div
      // direction="column"
      // ml={depth === 0 && `${shiftAmount[sectionId] * -2.5}rem`}
      // borderRadius="md"
      >
        <div
          // width="100%"
          // bg={focus ? "gray.50" : "white"}
          onClick={() => applyFocus()}
          style={{
            width: "100%",
            backgroundColor: activeObj === sectionId ? "#ffffff" : "#000000",
            display: "flex",
            padding: "1rem 1.25rem",
          }}
          // ref={ref}
          // direction="column"
          // padding="1rem 1.25rem"
          // my="0.5rem"
          // borderRadius="md"
          // border="1px"
          // borderColor="gray.200"
          id={sectionId}
          className="test"
        >
          {/* {getTopLevelSectionId(activeObj) === sectionId && <Breadcrumbs />} */}
          <div mb="1rem">
            <SectionHeading heading={theSection.name} />
            {/* {maybeIncludeNestedIncrementer()} */}
          </div>

          {/* <SectionUI
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={theSection}
        /> */}
        </div>
        {/* {visibleSectionIds.length > 0 &&
        visibleSectionIds.map((e, idx) => (
          <NestedSection
            parentId={sectionId}
            sectionId={e.id}
            visibleSectionIds={e.children}
            idx={idx}
            key={`Nested-Sec-${e.id}-${idx}`}
            depth={depth + 1}
          />
        ))} */}
      </div>

      <Flex
      // direction="column"
      // ml={depth === 0 && `${shiftAmount[sectionId] * -2.5}rem`}
      // borderRadius="md"
      >
        <Flex
          width="100%"
          bg={activeObj === sectionId ? "white" : "black"}
          onClick={() => applyFocus()}
          // style={{width:"100%", backgroundColor: focus ? "#ffffff" : "#000000", display:"flex", padding:"1rem 1.25rem", }}
          // ref={ref}
          // direction="column"
          padding="1rem 1.25rem"
          // my="0.5rem"
          // borderRadius="md"
          // border="1px"
          // borderColor="gray.200"
          id={sectionId}
        >
          {/* {getTopLevelSectionId(activeObj) === sectionId && <Breadcrumbs />} */}
          <HStack mb="1rem">
            <SectionHeading heading={theSection.name} />
            {/* {maybeIncludeNestedIncrementer()} */}
          </HStack>

          {/* <SectionUI
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={theSection}
        /> */}
        </Flex>
        {/* {visibleSectionIds.length > 0 &&
        visibleSectionIds.map((e, idx) => (
          <NestedSection
            parentId={sectionId}
            sectionId={e.id}
            visibleSectionIds={e.children}
            idx={idx}
            key={`Nested-Sec-${e.id}-${idx}`}
            depth={depth + 1}
          />
        ))} */}
      </Flex>
    </>
  );
};

export default React.memo(SectionContainer);
