import { useEffect, useRef } from "react";
import { create } from "zustand";

// Create the store
export const useFloatingBox = create((set) => ({
  isVisible: false,
  content: "",
  position: { x: 0, y: 0 },
  setVisible: (visible) => set({ isVisible: visible }),
  setContent: (content) => set({ content }),
  setPosition: (x, y) => set({ position: { x, y } }),
}));

export function FloatingBox() {
  const { isVisible, content, position } = useFloatingBox();
  const boxRef = useRef(null);

  // Ensure the box stays within viewport bounds
  useEffect(() => {
    if (!boxRef.current || !isVisible) return;

    const box = boxRef.current;
    const rect = box.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Adjust horizontal position if necessary
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 8; // 8px padding from viewport edge
    }

    // Adjust vertical position if necessary
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 8;
    }

    // Apply the adjusted position
    box.style.transform = `translate(${x}px, ${y}px)`;
  }, [isVisible, position]);

  if (!isVisible) return null;

  return (
    <div
      ref={boxRef}
      className="fixed left-0 top-0 z-50 max-h-96 w-64 overflow-y-auto rounded-lg 
                 border border-gray-200 bg-white shadow-lg dark:border-gray-700 
                 dark:bg-gray-800"
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    >
      <div className="p-4">
        <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {content}
        </div>
      </div>
    </div>
  );
}

export function getFloatingBoxHandlers(value) {
  function onMouseOver(event) {
    useFloatingBox.getState().setContent(value);
    useFloatingBox
      .getState()
      .setPosition(event.clientX + 10, event.clientY + 10);
    useFloatingBox.getState().setVisible(true);
  }

  function onMouseLeave() {
    useFloatingBox.getState().setVisible(false);
  }

  return { onMouseOver, onMouseLeave };
}
