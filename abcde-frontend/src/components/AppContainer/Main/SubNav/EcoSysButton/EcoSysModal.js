import { useState, createContext, useContext } from "react";

import {
  Box,
  Heading,
  InputGroup,
  InputLeftElement,
  Input,
  Grid,
  Text,
  VStack,
  CheckboxGroup,
  Checkbox,
  Button,
  HStack,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import ModalContainer from "../../../../../utils/ModalContainer";

export const EcoSysContext = createContext(null);

export default function EcoSysModal({ isOpen, onClose }) {
  const [ecoSysToggle, setEcoSysToggle] = useState(true);

  function flipEcoSysToggle() {
    setEcoSysToggle(!ecoSysToggle);
  }

  return (
    <EcoSysContext.Provider value={{ onClose, ecoSysToggle, flipEcoSysToggle }}>
      <ModalContainer
        onClose={onClose}
        isOpen={isOpen}
        size={"full"}
        header={<Header />}
        body={<Body />}
        footer={<Footer />}
      />
    </EcoSysContext.Provider>
  );
}

function Header() {
  const { ecoSysToggle, flipEcoSysToggle } = useContext(EcoSysContext);

  return (
    <HStack spacing={5}>
      <Heading as="h1" size="lg">
        {ecoSysToggle ? "Community Templates" : "Submit a Template"}
      </Heading>
      <Button size="sm" onClick={flipEcoSysToggle}>
        {ecoSysToggle ? "Submit" : "Find Templates"}
      </Button>
    </HStack>
  );
}

function Body() {
  const { ecoSysToggle } = useContext(EcoSysContext);

  return <>{ecoSysToggle ? <BodyFindTemplate /> : <BodySubmitTemplate />}</>;
}

function BodyFindTemplate() {
  return (
    <>
      <Grid
        gap={10}
        templateRows="min-content 1fr"
        templateColumns="minmax(min-content, 17em) 1.25fr 2fr"
      >
        <EcoSearch />
        <EcoResultsList />
        <EcoDescription />
      </Grid>
    </>
  );
}

function BodySubmitTemplate() {
  return <Box>Find Template Body</Box>;
}

function Footer() {
  const { ecoSysToggle, onClose } = useContext(EcoSysContext);
  return (
    <HStack>
      <Button>{ecoSysToggle ? "Load Template" : "Submit Template"}</Button>
      <Button onClick={onClose}>Close</Button>
    </HStack>
  );
}

function EcoItem() {
  return (
    <Box>
      <Heading as="h2" size="md">
        A Search Result
      </Heading>
      <Text size="sm">
        Aenean molestie, turpis id venenatis fermentum, urna augue feugiat erat,
        a viverra sem purus vitae nulla. Integer sodales eget purus ut faucibus.
      </Text>
    </Box>
  );
}

function EcoSearch() {
  return (
    <VStack colSpan={1} align="stretch" maxH="80vh" overflowY="auto">
      <EcoSearchInput />
      <EcoCheckbox />
    </VStack>
  );
}

function EcoSearchInput() {
  return (
    <InputGroup>
      <InputLeftElement
        pointerEvents="none"
        children={<SearchIcon color="gray.300" />}
      />
      <Input placeholder="Search" />
    </InputGroup>
  );
}

function EcoCheckbox() {
  return (
    <CheckboxGroup defaultValue={["Templates"]}>
      <VStack align="stretch">
        <Checkbox value="Templates">Templates</Checkbox>
        <Checkbox value="Sections">Sections</Checkbox>
        <Checkbox value="UITypes">UI Types</Checkbox>
      </VStack>
    </CheckboxGroup>
  );
}

function EcoResultsList() {
  return (
    <VStack
      direction="column"
      align="stretch"
      maxH="80vh"
      overflowY="auto"
      spacing={5}
      colSpan={1}
    >
      <EcoItem />
      <EcoItem />
      <EcoItem />
      <EcoItem />
      <EcoItem />
      <EcoItem />
      <EcoItem />
      <EcoItem />
    </VStack>
  );
}

function EcoDescription() {
  return (
    <VStack align="stretch" colSpan={1} maxH="80vh" overflowY="auto">
      <Heading as="h2">The Result I Want</Heading>
      <Text>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. In auctor
        luctus libero, tincidunt suscipit ante gravida in. Praesent placerat
        egestas purus vitae rhoncus. Phasellus laoreet tellus ipsum, in
        facilisis quam luctus sit amet. Praesent non dictum lectus, eu placerat
        quam. Cras id nisl eu mi vulputate pretium. Aenean molestie, turpis id
        venenatis fermentum, urna augue feugiat erat, a viverra sem purus vitae
        nulla. Integer sodales eget purus ut faucibus. Cras lacinia rutrum nibh
        eu tincidunt. Praesent in cursus turpis.
      </Text>
      <Text>
        Morbi rhoncus fermentum pellentesque. Aliquam nibh nisl, condimentum
        eget facilisis id, fermentum in quam. Donec eget lorem eu sapien
        scelerisque iaculis eu sit amet mi. Nulla massa est, efficitur ut orci
        eu, pharetra imperdiet nulla. Curabitur eu condimentum eros. Vestibulum
        a nulla eget lectus efficitur auctor. Vestibulum sollicitudin convallis
        arcu, id imperdiet mi lacinia a. Nunc at enim sem. Vivamus auctor ex in
        fringilla finibus. Donec eu risus venenatis leo dignissim porttitor. Sed
        libero eros, malesuada sed mi eget, malesuada ultricies quam.
      </Text>
    </VStack>
  );
}
