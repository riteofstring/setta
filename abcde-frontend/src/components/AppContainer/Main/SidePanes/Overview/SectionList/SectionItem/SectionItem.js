import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useEffect } from "react";
import { PANEID } from "../../../../../../../utils/constants";
import { useAtom } from "jotai";
import { goToCoordinates } from "../../../../CustomMapInteraction/state";
import {
  relativeSectionPosition,
  positionUpdateRequested,
  positionUpdated as positionUpdatedState,
} from "../../../../../../UI/Section/state";
import { useUpdateAtom, useAtomValue } from "jotai/utils";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  const setGoToCoordinates = useUpdateAtom(goToCoordinates);
  const currPositionOfSection = useAtomValue(
    relativeSectionPosition(sectionId)
  );
  const setPositionUpdateRequested = useUpdateAtom(
    positionUpdateRequested(sectionId)
  );
  const setPanePositionUpdateRequested = useUpdateAtom(
    positionUpdateRequested(PANEID)
  );

  const [positionUpdated, setPositionUpdated] = useAtom(
    positionUpdatedState(sectionId)
  );
  const panePositionUpdated = useAtomValue(positionUpdatedState(PANEID));

  useEffect(() => {
    if (positionUpdated && panePositionUpdated) {
      const { y, x } = currPositionOfSection;
      setGoToCoordinates({ y: -y, x: -x });
    }
    setPositionUpdated(false);
  }, [positionUpdated]);

  const onClick = () => {
    setPositionUpdateRequested(true);
    setPanePositionUpdateRequested(true);
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
