import { useEffect, useRef } from "react";
import { create } from "zustand";

export const useFloatingBox = create((set) => ({
  isEnabled: false,
  content: null,
  position: { x: 0, y: 0 },
  offset: { x: 10, y: 10 }, // Default offset from cursor
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  setContent: (content) => set({ content }),
  setOffset: (x, y) => set({ offset: { x, y } }),
}));

export const FloatingBox = () => {
  const { isEnabled, content } = useFloatingBox();
  const boxRef = useRef(null);

  // Ensure the box stays within viewport bounds
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !isEnabled) return;

    const handleMouseMove = (event) => {
      console.log("clientXY", event.clientX, event.clientY);
      box.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      box.style.x = event.clientX;
      box.style.y = event.clientY;
    };

    // const rect = box.getBoundingClientRect();
    // const viewportWidth = window.innerWidth;
    // const viewportHeight = window.innerHeight;

    // let { x, y } = position;

    // // Adjust horizontal position if necessary
    // if (x + rect.width > viewportWidth) {
    //   x = viewportWidth - rect.width - 8;
    // }

    // // Adjust vertical position if necessary
    // if (y + rect.height > viewportHeight) {
    //   y = viewportHeight - rect.height - 8;
    // }

    // Add event listener
    window.addEventListener("mousemove", handleMouseMove);

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isEnabled]);

  if (!isEnabled || !content) return null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-none fixed left-0 top-0 z-50 max-h-96 w-64 overflow-y-auto 
                 rounded-lg border border-gray-200 bg-white shadow-lg 
                 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="p-4">
        <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {content}
        </div>
      </div>
    </div>
  );
};

export function getFloatingBoxHandlers(value) {
  function onMouseOver() {
    if (value) {
      const s = useFloatingBox.getState();
      s.setContent(value);
    }
  }

  function onMouseLeave() {
    useFloatingBox.getState().setContent(null);
  }

  return { onMouseOver, onMouseLeave };
}

export function useFloatingBoxNextToMouseCursor() {
  useEffect(() => {
    const handleMouseMove = (event) => {
      const s = useFloatingBox.getState();
      s.setPosition(event.clientX + s.offset.x, event.clientY + s.offset.y);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);
}

export function enableFloatingBox() {
  useFloatingBox.setState({ isEnabled: true });
}

export function disableFloatingBox() {
  useFloatingBox.setState({ isEnabled: false });
}
