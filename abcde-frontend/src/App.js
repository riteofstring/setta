import { useState } from "react";
import "./App.css";
import {
  ThemeProvider,
  CSSReset,
  Box,
  Flex,
  Grid,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
} from "@chakra-ui/core";

function App() {
  const [visible, setVisible] = useState(true);

  const flipVisible = () => {
    setVisible(!visible);
  };

  return (
    <ThemeProvider>
      <CSSReset />
      <Flex align="center" justify="center" h="100vh">
        <Grid w="80vw" maxWidth={1280} h="100%" gap={20}>
          <Flex flexDir="column">
            <Flex flexDir="column">
              <Flex>
                <Menu>
                  <MenuButton as={Button} rightIcon="chevron-down">
                    Select Model
                  </MenuButton>
                  <MenuList>
                    <MenuItem>Model A</MenuItem>
                    <MenuItem>Model B</MenuItem>
                    <MenuItem>Model C</MenuItem>
                    <MenuItem>Model D</MenuItem>
                  </MenuList>
                </Menu>
                <Button onClick={flipVisible}>Collapse</Button>
              </Flex>
              <Flex flexDir="column" display={visible ? "flex" : "none"}>
                <Flex flexDir="column" ml={20}>
                  SubOne
                </Flex>
                <Flex flexDir="column" ml={20}>
                  SubTwo
                  <Flex flexDir="column" ml={20}>
                    SubTwoSubOne
                  </Flex>
                </Flex>
                <Flex flexDir="column" ml={20}>
                  SubThree
                </Flex>
              </Flex>
            </Flex>
            <Flex>Two</Flex>
          </Flex>
        </Grid>
      </Flex>
    </ThemeProvider>
  );
}

export default App;
