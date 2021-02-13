import "./App.css";
import { Flex } from "@chakra-ui/react";
import AppContainer from "./components/AppContainer/AppContainer";

// import {
//   DragHandleIcon,
//   ChevronRightIcon,
//   ChevronLeftIcon,
// } from "@chakra-ui/icons";

function App() {
  return (
    <Flex width="100vw" height="100vh" flexDir="column" align="center">
      <AppContainer />
    </Flex>
  );
}

export default App;
