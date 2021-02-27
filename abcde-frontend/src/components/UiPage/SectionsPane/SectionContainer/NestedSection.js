import React, { useState } from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer";
import { Flex, Box } from "@chakra-ui/react";
import { FiCornerDownRight } from "react-icons/fi";
import { motion } from "framer-motion";
import { useMeasurePosition } from "../../../../utils/useMeasurePosition";

const NestedSection = ({
  parentId,
  rootId,
  sectionId,
  nextId,
  idx,
  depth,
  updatePosition,
  updateOrder,
}) => {
  const theSection = useStoreState((state) => state.master.sections[sectionId]);
  const isShown = useStoreState((state) => state.master.isShown[parentId]);
  const isVisible = useStoreState((state) => state.master.isVisible[sectionId]);
  const idHierarchy = useStoreState(
    (state) => state.master.idHierarchy[sectionId]
  );

  const [isDragging, setDragging] = useState(false);

  const ref = useMeasurePosition((pos) => updatePosition(idx, pos));

  return isVisible ? (
    <Flex
      mt="0rem"
      ml="2.5rem"
      display={!isShown ? "none" : "inherit"}
      key={`nest-flex-${sectionId}`}
      style={{
        zIndex: isDragging ? 3 : 1,
      }}
    >
      <Box mt="0" mr=".5rem" key={`ic-con-${sectionId}`}>
        <FiCornerDownRight
          size="2.4rem"
          color="#CBD5E0"
          key={`icon-${sectionId}`}
        />
      </Box>
      <motion.div
        ref={ref}
        layout
        initial={false}
        whileHover={{
          scale: 1.03,
          boxShadow: "0px 3px 3px rgba(0,0,0,0.15)",
        }}
        whileTap={{
          scale: 1.12,
          boxShadow: "0px 5px 5px rgba(0,0,0,0.1)",
        }}
        drag="y"
        onDragStart={() => setDragging(true)}
        onDragEnd={() => setDragging(false)}
        onViewportBoxUpdate={(_viewportBox, delta) => {
          isDragging && updateOrder(idx, delta.y.translate);
        }}
      >
        <SectionContainer
          sectionId={sectionId}
          rootId={rootId}
          parentId={parentId}
          nextId={nextId}
          childrenIds={idHierarchy.children}
          theSection={theSection}
          depth={depth}
        />
      </motion.div>
    </Flex>
  ) : (
    <></>
  );
};

export default NestedSection;

// import React, { useState } from "react";
// import { useStoreState } from "easy-peasy";
// import SectionContainer from "./SectionContainer";
// import { Flex, Box } from "@chakra-ui/react";
// import { FiCornerDownRight } from "react-icons/fi";
// import { motion } from "framer-motion";
// import { useMeasurePosition } from "../../../../utils/useMeasurePosition";

// const NestedSection = ({
//   parentId,
//   rootId,
//   sectionId,
//   nextId,
//   idx,
//   depth,
//   updatePosition,
//   updateOrder,
// }) => {
//   const theSection = useStoreState((state) => state.master.sections[sectionId]);
//   const isShown = useStoreState((state) => state.master.isShown[parentId]);
//   const isVisible = useStoreState((state) => state.master.isVisible[sectionId]);
//   const idHierarchy = useStoreState(
//     (state) => state.master.idHierarchy[sectionId]
//   );
//   const isListRoot = useStoreState(
//     (state) => state.master.isListRoot[sectionId]
//   );

//   const getSectionContainer = () => {
//     return (
//       <SectionContainer
//         sectionId={sectionId}
//         rootId={rootId}
//         parentId={parentId}
//         nextId={nextId}
//         childrenIds={idHierarchy.children}
//         theSection={theSection}
//         depth={depth}
//       />
//     );
//   };

//   const NestedDraggable = (props) => {
//     const [isDragging, setDragging] = useState(false);

//     const ref = useMeasurePosition((pos) => updatePosition(idx, pos));

//     return (
//       <motion.div
//         ref={ref}
//         layout
//         initial={false}
//         whileHover={{
//           scale: 1.03,
//           boxShadow: "0px 3px 3px rgba(0,0,0,0.15)",
//         }}
//         whileTap={{
//           scale: 1.12,
//           boxShadow: "0px 5px 5px rgba(0,0,0,0.1)",
//         }}
//         drag="y"
//         onDragStart={() => setDragging(true)}
//         onDragEnd={() => setDragging(false)}
//         onViewportBoxUpdate={(_viewportBox, delta) => {
//           isDragging && updateOrder(idx, delta.y.translate);
//         }}
//       >
//         {props.children}
//       </motion.div>
//     );
//   };

//   console.log("isListRoot", sectionId, isListRoot);

//   return isVisible ? (
//     <Flex
//       mt="0rem"
//       ml="2.5rem"
//       display={!isShown ? "none" : "inherit"}
//       key={`nest-flex-${sectionId}`}
//       // style={{
//       //   zIndex: isDragging ? 3 : 1,
//       // }}
//     >
//       <Box mt="0" mr=".5rem" key={`ic-con-${sectionId}`}>
//         <FiCornerDownRight
//           size="2.4rem"
//           color="#CBD5E0"
//           key={`icon-${sectionId}`}
//         />
//       </Box>

//       {true ? (
//         <NestedDraggable>{getSectionContainer()}</NestedDraggable>
//       ) : (
//         getSectionContainer()
//       )}
//     </Flex>
//   ) : (
//     <></>
//   );
// };

// export default NestedSection;
