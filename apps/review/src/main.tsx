import { createRoot } from "react-dom/client";
import "@riteofstring/setta/styles.css";
import "./index.css";

import { ReviewController } from "./app/ReviewController";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Setta Review requires a root element.");
}

createRoot(rootElement).render(<ReviewController />);
