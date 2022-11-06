import { Box, Stack } from "@chakra-ui/react";
import SectionTitle from "../Header/Title/SectionTitle";

export function Deck({ sectionId, sectionStyle, dragDropProps, children }) {
  return (
    <Box {...sectionStyle} {...dragDropProps}>
      <Stack
        bg="hsla(212, 22%, 50%, 0.2)"
        pt=".75rem"
        px="2rem"
        pb="1.5rem"
        borderRadius="3xl"
        className="STACK"
      >
        <DeckSectionTitle sectionId={sectionId} />
        {children}
      </Stack>
    </Box>
  );
}

function DeckSectionTitle({ sectionId }) {
  const editableProps = {
    fontFamily: "Work Sans",
    fontWeight: "bold",
    color: "gray.100",
    fontSize: "4xl",
    mb: "-.5rem",
    letterSpacing: "tighter",
  };

  const inputProps = {
    className: "nodrag",
    w: "450px",
    letterSpacing: "tighter",
  };
  return (
    <SectionTitle
      sectionId={sectionId}
      editableProps={editableProps}
      inputProps={inputProps}
    />
  );
}
