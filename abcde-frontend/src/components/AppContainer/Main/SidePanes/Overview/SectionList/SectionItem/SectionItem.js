import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useEffect } from "react";
import { PANEID } from "../../../../../../../utils/constants";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  const setGoToCoordinates = useStoreActions(
    (actions) => actions.mapInteraction.setGoToCoordinates
  );
  const getCurrPositionOfSection = useStoreActions(
    (actions) => actions.sectionPositions.getCurrPositionOfSection
  );

  const setPositionUpdateRequested = useStoreActions(
    (action) => action.sectionPositions.setPositionUpdateRequested
  );

  const sectionPositionUpdated = useStoreState(
    (actions) => actions.sectionPositions.positionUpdated[sectionId]
  );

  const panePositionUpdated = useStoreState(
    (actions) => actions.sectionPositions.positionUpdated[PANEID]
  );

  const setPositionUpdated = useStoreActions(
    (actions) => actions.sectionPositions.setPositionUpdated
  );

  useEffect(() => {
    if (sectionPositionUpdated && panePositionUpdated) {
      const { y, x } = getCurrPositionOfSection(sectionId);
      setGoToCoordinates({ y: -y, x: -x });
    }
    setPositionUpdated({ sectionId, positionUpdated: false });
  }, [sectionPositionUpdated]);

  const onClick = () => {
    setPositionUpdateRequested({ sectionId, positionUpdateRequested: true });
    setPositionUpdateRequested({
      sectionId: PANEID,
      positionUpdateRequested: true,
    });
  };

  return (
    <HStack py="0.125rem">
      <DragHandleIcon
        cursor="move"
        size="sm"
        color="gray.200"
        visibility={isList ? "visible" : "hidden"}
      />

      <Text
        cursor="pointer"
        py={0.5}
        px={2}
        w="100%"
        borderRadius="0.5rem"
        _hover={{
          boxShadow: "inset 0px 0px 0px 10px gray.500",
          bg: "gray.400",
          color: "gray.50",
        }}
        onClick={onClick}
      >
        {sectionHeading}
      </Text>
    </HStack>
  );
}
