import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/inter";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/work-sans";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/work-sans/700.css";
import { router } from "components/Pages/router";
import { useEffect, useRef } from "react";
import { RouterProvider } from "react-router-dom";

export function App() {
  // const observerRef = useRef(null);

  // useEffect(() => {
  //   const handleWheel = (event) => {
  //     console.log("Wheel event detected", event);
  //     // Your wheel event handling logic here
  //   };

  //   // Set to keep track of iframes we've already processed
  //   const processedIframes = new WeakSet();

  //   // Function to add overlays to iframes
  //   const addOverlay = (iframe) => {
  //     if (processedIframes.has(iframe)) {
  //       return; // Skip if we've already processed this iframe
  //     }

  //     const overlay = document.createElement("div");
  //     overlay.style.position = "absolute";
  //     overlay.style.top = "0";
  //     overlay.style.left = "0";
  //     overlay.style.width = "100%";
  //     overlay.style.height = "100%";
  //     overlay.style.zIndex = "1000";
  //     overlay.style.pointerEvents = "none"; // Allow interactions with iframe content

  //     // Only capture wheel events
  //     overlay.addEventListener("wheel", handleWheel, { capture: true });

  //     // Use a relative positioning container if not already present
  //     let container = iframe.parentNode;
  //     if (getComputedStyle(container).position === "static") {
  //       container = document.createElement("div");
  //       container.style.position = "relative";
  //       iframe.parentNode.insertBefore(container, iframe);
  //       container.appendChild(iframe);
  //     }

  //     container.appendChild(overlay);
  //     processedIframes.add(iframe);
  //   };

  //   // Process existing iframes
  //   document.querySelectorAll("iframe").forEach(addOverlay);

  //   // Set up a MutationObserver to watch for new iframes
  //   observerRef.current = new MutationObserver((mutations) => {
  //     mutations.forEach((mutation) => {
  //       if (mutation.type === "childList") {
  //         mutation.addedNodes.forEach((node) => {
  //           if (node.tagName === "IFRAME") {
  //             addOverlay(node);
  //           } else if (node.querySelectorAll) {
  //             node.querySelectorAll("iframe").forEach(addOverlay);
  //           }
  //         });
  //       }
  //     });
  //   });

  //   observerRef.current.observe(document.body, {
  //     childList: true,
  //     subtree: true,
  //   });

  //   // Cleanup function
  //   return () => {
  //     if (observerRef.current) {
  //       observerRef.current.disconnect();
  //     }
  //     // Remove event listeners from overlays if needed
  //   };
  // }, []);

  return <RouterProvider router={router} />;
}
