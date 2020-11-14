import "./App.css";
import { ThemeProvider, CSSReset } from "@chakra-ui/core";
import Container from "./components/Container/Container";

function App() {
  return (
    <ThemeProvider>
      <CSSReset />
      <Container />
    </ThemeProvider>
  );
}

export default App;
