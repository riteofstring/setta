import "@fontsource/cormorant-garamond";
import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/inter";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/source-code-pro";
import "@fontsource/work-sans";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/700.css";

import { AppContainer } from "./components/AppContainer/AppContainer";

export function App() {
  return (
    <div className="flex h-screen w-screen flex-col items-center font-body">
      <AppContainer />
    </div>
  );
}
