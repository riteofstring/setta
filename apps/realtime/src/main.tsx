import { createRoot } from "react-dom/client";
import "@riteofstring/setta/styles.css";
import "@setta/realtime/styles.css";

import { RealtimeApp } from "./app/RealtimeApp";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Realtime requires a root element.");
}

createRoot(rootElement).render(<RealtimeApp />);
