import {
  Box,
  Button,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
} from "@chakra-ui/react";

import { SearchIcon } from "@chakra-ui/icons";

import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import React, { useState } from "react";

import {
  getCollectionDetails,
  getCollectionsAndModules,
} from "dbRequests/sectionConfig";
import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default React.memo(SectionConfig);

function SectionConfig() {
  const sectionId = useStoreState((x) => x.activeSection.id);
  const setActiveSection = useStoreActions((x) => x.activeSection.setId);
  const cameFromUIConfig = useStoreState((x) => x.uiEditor.cameFromUIConfig);
  const setCameFromUIConfig = useStoreActions(
    (x) => x.uiEditor.setCameFromUIConfig
  );
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);
  const setSectionUITypeId = useStoreActions(
    (x) => x.thunks.setSectionUITypeId
  );
  const setSectionUITypeConfig = useStoreActions(
    (x) => x.thunks.setSectionUITypeConfig
  );

  const [parentId] = useGetSectionInfo(sectionId, ["parentId"]);
  const [currTypeId, savedConfig] = useGetSectionType(sectionId, [
    "id",
    "config",
  ]);

  const onGoBackClick = () => {
    setActiveSection(parentId);
    setCameFromUIConfig(false);
    setTabIndex(1);
  };

  const onSectionTypeChange = (e) => {
    if (e && e !== currTypeId) {
      setSectionUITypeId({ uiTypeId: e, sectionId });
    }
  };

  const onConfigChange = ({ newValueFn }) => {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "collections", newValueFn },
    });
  };

  return (
    <>
      {cameFromUIConfig && <Button onClick={onGoBackClick}>Go back</Button>}
      <SectionConfigCore
        onSectionTypeChange={onSectionTypeChange}
        currTypeId={currTypeId}
        sectionId={sectionId}
        savedConfig={savedConfig}
        onConfigChange={onConfigChange}
      />
    </>
  );
}

function SectionConfigCore({
  onSectionTypeChange,
  currTypeId,
  sectionId,
  savedConfig,
  onConfigChange,
}) {
  const [results, setResults] = useState({});
  const allCollections = useStoreState((x) => x.codeInfo.allCollections);
  const updateCodeInfos = useStoreActions((x) => x.codeInfo.updateInfos);

  async function onSubmit(searchTerm) {
    const x = await getCollectionsAndModules({ allCollections, searchTerm });
    setResults(x);
  }

  async function onChange({ newValueFn, id }) {
    // collection needs to be retrieved from db
    if (!(id in allCollections)) {
      const collectionDetails = await getCollectionDetails(id);
      updateCodeInfos(collectionDetails);
    }
    onConfigChange({ newValueFn });
  }

  return (
    <>
      <Heading as="h3" size="xs" textTransform="uppercase" color="gray.400">
        Card Types
      </Heading>
      <SectionConfigTypeSelection
        onDropdownSelect={onSectionTypeChange}
        selectedId={currTypeId}
        sectionId={sectionId}
      />

      <Heading as="h3" size="xs" textTransform="uppercase" color="gray.400">
        Contents
      </Heading>
      <Box
        py="0.5rem"
        px="0.75rem"
        borderRadius="2xl"
        bg="white"
        boxShadow="inner"
        border="1px"
        borderColor="white"
        flexGrow="1"
        mb="2.5rem"
        display="flex"
        flexDirection="column"
        data-testid={`SectionConfig ${sectionId}`}
      >
        <Search onSubmit={onSubmit} />
        <SectionConfigComp
          savedConfig={savedConfig}
          onChange={onChange}
          allCollections={allCollections}
          results={results}
        />
      </Box>
    </>
  );
}

function Search({ onSubmit }) {
  const [text, setText] = useState("");
  function onChange(e) {
    setText(e.target.value);
  }
  function onClick() {
    onSubmit(text);
  }

  return (
    <InputGroup pb="1rem">
      <InputLeftElement pointerEvents="none">
        <SearchIcon color="gray.300" />
      </InputLeftElement>
      <Input variant="flushed" placeholder="Search" onChange={onChange} />
      <InputRightElement width="4.5rem">
        <Button h="1.75rem" size="sm" onClick={onClick} />
      </InputRightElement>
    </InputGroup>
  );
}

// function ComboboxPlaceholder() {
//   return (
//     <Flex
//       direction="column"
//       align="stretch"
//       overflow="visible"
//       h="2.5rem"
//       w="100%"
//       backgroundColor="white"
//       borderRadius="full"
//       mb="1rem"
//       boxShadow="sm"
//     >
//       <InputGroup
//         // width="100%"
//         className="nodrag"
//       >
//         <InputLeftElement pointerEvents="none">
//           <SearchIcon color="gray.300" />
//         </InputLeftElement>
//         <InputRightElement>
//           <IconButton
//             aria-label={"toggle menu"}
//             borderRadius="full"
//             bg="white"
//             icon={<ChevronDownIcon />}
//           />
//         </InputRightElement>
//       </InputGroup>

//       <Flex
//         direction="column"
//         w="100%"
//         alignItems="stretch"
//         transitionDuration="0.25s"
//       ></Flex>
//     </Flex>
//   );
// }
