import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions } from "easy-peasy";

export default function SectionItem({
  sectionId,
  sectionHeading,
  isList,
  isListRoot,
}) {
  const setGoToHeight = useStoreActions(
    (actions) => actions.mapInteraction.setGoToHeight
  );
  const getCurrPositionOfSection = useStoreActions(
    (actions) => actions.sectionSizes.getCurrPositionOfSection
  );

  const onClick = () => {
    setGoToHeight(getCurrPositionOfSection(sectionId));
  };

  return (
    <HStack py="0.125rem">
      {isList && !isListRoot ? (
        <DragHandleIcon cursor="move" size="sm" color="gray.200" />
      ) : (
        <></>
      )}
      <Text onClick={onClick}>{sectionHeading}</Text>
    </HStack>
  );
}
