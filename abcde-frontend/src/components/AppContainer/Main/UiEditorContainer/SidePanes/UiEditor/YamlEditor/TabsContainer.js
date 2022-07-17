import {
  AddIcon,
  SmallCloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import { TabList, Tab, IconButton, HStack } from "@chakra-ui/react";
import { useState } from "react";

export default function TabsContainer({
  tabNumArray,
  currTabIdx,
  onAddClick,
  onRemoveClick,
  onGoToNext,
  onGoToPrev,
}) {
  const [tabHover, setTabHover] = useState({});

  function onTabMouseOver(idx) {
    setTabHover({ ...tabHover, [idx]: true });
  }

  function onTabMouseLeave(idx) {
    setTabHover({ ...tabHover, [idx]: false });
  }

  function closeIconCondition(idx) {
    return idx === currTabIdx || tabHover[idx];
  }

  function onRemoveClickWrapper(idx) {
    onRemoveClick(idx);
    delete tabHover[idx];
  }

  return (
    <TabList display="flex" alignItems="center" overflow="hidden">
      {tabNumArray.map((e) => (
        <HStack spacing="1px" key={`uitab-${e}`}>
          <Tab
            sx={{
              borderBottomRadius: "0.5rem",
              borderLeft: "1px",
              borderRight: "1px",
              borderBottom: "1px",
              borderColor: "gray.200",
              padding: "0.33rem 0.25rem 0.33rem .5rem",
              marginRight: "0.125rem",
            }}
            _selected={{ color: "white", bg: "gray.400" }}
            _hover={{ color: "white", bg: "gray.600" }}
            _active={{ color: "white", bg: "gray.700" }}
          >
            {e}
            <IconButton
              icon={closeIconCondition(e) && <SmallCloseIcon />}
              borderRadius="full"
              variant="ghost"
              _hover={{ backgroundColor: "gray.900" }}
              size="xs"
              ml="0.25rem"
              marginright="0"
              onClick={() => onRemoveClickWrapper(e)}
              onMouseOver={() => onTabMouseOver(e)}
              onMouseLeave={() => onTabMouseLeave(e)}
            />
          </Tab>
        </HStack>
      ))}

      <IconButton
        icon={<AddIcon />}
        borderRadius="full"
        variant="ghost"
        size="xs"
        marginright="0.125rem"
        onClick={onAddClick}
      />
      <HStack w="100%" justifyContent="flex-end">
        <IconButton
          icon={<ChevronLeftIcon />}
          borderRadius="full"
          variant="ghost"
          size="xs"
          marginright="0.125rem"
          onClick={onGoToPrev}
        />
        <IconButton
          icon={<ChevronRightIcon />}
          borderRadius="full"
          variant="ghost"
          size="xs"
          marginright="0.125rem"
          onClick={onGoToNext}
        />
      </HStack>
    </TabList>
  );
}
