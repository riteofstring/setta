import { Heading, HStack, Box } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import {
  useGetGroupPosition,
  useRequestGroupPositionUpdate,
} from "hooks/useGetSectionPosition";
import React, { forwardRef, useEffect, useState } from "react";
import { Menu, Item, useContextMenu } from "react-contexify";
import "react-contexify/dist/ReactContexify.css";
import { createPortal } from "react-dom";
import { CONTEXT_MENU } from "utils/constants";
import { findSortedIndex, insertIntoArrayOrXpend } from "utils/utils";

import { DragHandle } from "../DragHandle/DragHandle";
import { Remove } from "./Remove";

export const Container = forwardRef(
  (
    {
      id,
      children,
      columns = 1,
      handleListeners,
      horizontal,
      hover,
      onClick,
      onRemove,
      label,
      placeholder,
      style,
      scrollable,
      shadow,
      unstyled,
      ...props
    },
    ref
  ) => {
    const { show } = useContextMenu({ id });

    function displayMenu(e) {
      show(e);
    }

    const Component = onClick ? "button" : "div";

    return (
      <>
        <Box
          as={onClick ? "button" : "div"}
          {...props}
          {...style}
          ref={ref}
          _hover={{
            bg: "#BEC9D6",
          }}
          py="1.5rem"
          px="2rem"
          borderRadius="3xl"
          className={
            classNames()
            // styles.Container,
            // unstyled && styles.unstyled,
            // horizontal && styles.horizontal,
            // hover && styles.hover,
            // placeholder && styles.placeholder,
            // scrollable && styles.scrollable,
            // shadow && styles.shadow
          }
          sx={{ transition: "background-color 350ms ease" }}
          onClick={onClick}
          tabIndex={onClick ? 0 : undefined}
          // onContextMenu={displayMenu}
        >
          {label ? (
            <HStack alignItems="center" spacing="2rem" pb="1rem">
              <Heading as="h2" size="xl" color="gray.100">
                {label}
              </Heading>
              <DragHandle
                dragListeners={handleListeners}
                horizontal={true}
                px="5rem"
                borderRadius="xl"
                dragHandleBg="gray.400"
                flexGrow="1"
                h="2rem"
                alignSelf="center"
              />
              {onRemove ? <Remove onClick={onRemove} /> : undefined}
            </HStack>
          ) : null}
          {placeholder ? children : <ul>{children}</ul>}
        </Box>
        {createPortal(<SectionGroupMenu groupId={id} />, document.body)}
      </>
    );
  }
);

function SectionGroupMenu({ groupId }) {
  const addSection = useCreateDefaultSectionInfo();
  const setOneGroupChildren = useStoreActions(
    (x) => x.master.setOneGroupChildren
  );
  const setGroupsHaveUpdated = useStoreActions(
    (x) => x.master.setGroupsHaveUpdated
  );
  const requestPositionUpdate = useRequestGroupPositionUpdate(
    groupId,
    CONTEXT_MENU
  );
  const coords = useGetGroupPosition(groupId, CONTEXT_MENU, true);
  const [clickCoords, setClickCoords] = useState({});

  useEffect(() => {
    if (!_.isEmpty(coords)) {
      const ys = coords.map((x) => x.y);
      const insertIdx = findSortedIndex(ys, clickCoords.y);

      const newIds = addSection();
      console.log("");
      setOneGroupChildren({
        groupId,
        newStateFn: (x) =>
          insertIntoArrayOrXpend(x, insertIdx, false, ...newIds),
      });
      setGroupsHaveUpdated(true);
    }
  }, [coords]);

  function newSectionClick({ triggerEvent }) {
    const { clientX: x, clientY: y } = triggerEvent;
    setClickCoords({ x, y });
    requestPositionUpdate();
  }
  return (
    <Menu id={groupId}>
      <Item onClick={newSectionClick}>New Section</Item>
    </Menu>
  );
}
