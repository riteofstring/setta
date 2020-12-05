import "./App.css";
import { ChakraProvider } from "@chakra-ui/react";
import Container from "./components/UiPage/Container/Container";

function App() {
  return (
    <ChakraProvider>
      <Container />
    </ChakraProvider>
  );
}

export default App;
