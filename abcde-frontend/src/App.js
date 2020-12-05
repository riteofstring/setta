import "./App.css";
import { ChakraProvider } from "@chakra-ui/react";
import AppContainer from "./components/AppContainer/AppContainer";

function App() {
  return (
    <ChakraProvider>
      <AppContainer />
    </ChakraProvider>
  );
}

export default App;
