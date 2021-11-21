import { Box } from "@chakra-ui/react";

import ModalContainer from "../../../../../../../utils/ModalContainer/ModalContainer";

export default function ParamSweepModal(props) {
  const { isOpen, onClose } = props;
  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size={"6xl"}
      header={<Header />}
      body={<Body />}
      footer={<Footer />}
      tabTitle={}
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
