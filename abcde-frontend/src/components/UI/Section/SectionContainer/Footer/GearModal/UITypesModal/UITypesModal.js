import { useContext } from "react";
import { MenuContext } from "../../SectionFooter";
import { Box, HStack, Stack, Select, Input } from "@chakra-ui/react";
import ModalContainer from "../../../../../../../utils/ModalContainer";

export default function UITypesModal() {
  const { isOpen, onClose, modalSelect } = useContext(MenuContext);

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"6xl"}
      header={<Header />}
      body={<Body />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>UI Types</Box>;
}

function Body() {
  return (
    <Stack spacing={2}>
      <Item />
      <Item />
      <Item />
    </Stack>
  );
}

function Footer() {
  return <Box>Bye</Box>;
}

function Item() {
  return (
    <HStack>
      <Box>Item</Box>
      <Select placeholder="Select option">
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
        <option value="option3">Option 3</option>
      </Select>
      <Input placeholder="Min" />
      <Input placeholder="Max" />
    </HStack>
  );
}
