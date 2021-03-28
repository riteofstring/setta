import { useContext } from "react";
import { MenuContext } from "../../SectionFooter";
import { Box } from "@chakra-ui/react";
import ModalContainer from "../../../../../../../utils/ModalContainer";

export default function ParamSweepModal() {
  const { isOpen, onClose } = useContext(MenuContext);

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
  return <Box>Parameter Sweep</Box>;
}

function Body() {
  return <Box>SWEEPS</Box>;
}

function Footer() {
  return <Box>Bye</Box>;
}
