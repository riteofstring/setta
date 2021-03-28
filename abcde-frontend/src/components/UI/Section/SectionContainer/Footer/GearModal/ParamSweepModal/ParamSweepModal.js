import { Box } from "@chakra-ui/react";
import { useContext } from "react";
import ModalContainer from "../../../../../../../utils/ModalContainer";
import { MenuContext } from "../../SectionFooter";

export default function ParamSweepModal() {
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
  return <Box>Parameter Sweep</Box>;
}

function Body() {
  return <Box>SWEEPS</Box>;
}

function Footer() {
  return <Box>Bye</Box>;
}
