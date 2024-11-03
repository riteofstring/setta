import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

export const useFloatingBox = create((set) => ({
  isEnabled: false,
  content: null,
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  setContent: (content) => set({ content }),
}));

export const FloatingBox = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const { isEnabled, content } = useFloatingBox();
  const boxRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (event) => {
      setPosition({ x: event.clientX + 10, y: event.clientY + 10 });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Ensure the box stays within viewport bounds
  useEffect(() => {
    if (!boxRef.current || !isEnabled) return;

    const box = boxRef.current;
    const rect = box.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Adjust horizontal position if necessary
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 8;
    }

    // Adjust vertical position if necessary
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 8;
    }

    // Apply the adjusted position
    box.style.transform = `translate(${x}px, ${y}px)`;
  }, [isEnabled, position]);

  if (!isEnabled || !content) return null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-none fixed left-0 top-0 z-50 max-h-96 w-64 overflow-y-auto 
                 rounded-lg border border-gray-200 bg-white shadow-lg 
                 dark:border-gray-700 dark:bg-gray-800"
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

export function enableFloatingBox(event) {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target.isContentEditable
  ) {
    return;
  }
  useFloatingBox.setState({ isEnabled: true });
}

export function disableFloatingBox() {
  useFloatingBox.setState({ isEnabled: false });
}
