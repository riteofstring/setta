import C from "constants/constants.json";
import { useEffect, useRef, useState } from "react";
import { addSectionInEmptySpace } from "state/actions/sections/createSections";
import { create } from "zustand";

export const useFloatingBox = create((set) => ({
  isEnabled: false,
  isFrozen: false,
  content: null,
  title: null,
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  setContent: (content, title) => set({ content, title }),
}));

let mouseMoved = false;

export const FloatingBox = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const { isEnabled, content, isFrozen, title } = useFloatingBox();
  const boxRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (event) => {
      mouseMoved = true;
      if (!isFrozen) {
        setPosition({ x: event.clientX + 10, y: event.clientY + 10 });
      }
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

  if (!isEnabled || !content || !mouseMoved) return null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-none fixed left-0 top-0 z-50 flex max-h-96 w-64 flex-col rounded-2xl border border-setta-200 bg-white p-4 shadow-lg dark:border-setta-700 dark:bg-setta-950"
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    >
      {title && (
        <h3 className="break-words pb-1 text-xs font-black uppercase text-setta-500 dark:text-setta-600">
          {title}
        </h3>
      )}
      <article className="flex-1 overflow-y-auto break-words text-sm text-setta-700 dark:text-setta-300">
        {content}
      </article>
      <p className="mt-4 border-t border-solid border-setta-100 pt-1 text-xs text-setta-500 dark:border-setta-700 dark:text-setta-600">
        press <span className="font-black">&quot;S&quot;</span> to open tooltip
        as new section &#40;while holding down{" "}
        <span className="font-black">&quot;Q&quot;</span>&#41;
      </p>
    </div>
  );
};

export function getFloatingBoxHandlers(content, title) {
  function onMouseOver() {
    if (content) {
      const s = useFloatingBox.getState();
      s.setContent(content, title);
    }
  }

  function onMouseLeave() {
    useFloatingBox.getState().setContent(null, null);
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

export function convertFloatingBoxToSection() {
  const s = useFloatingBox.getState();
  if (s.isEnabled && s.content) {
    const content = s.title ? `## ${s.title}\n\n${s.content}` : s.content;
    addSectionInEmptySpace({
      type: C.INFO,
      inputSectionProps: {
        name: s.title,
        description: content,
        size: { width: 300, height: 300 },
      },
    });
  }
}

export function freezeFloatingBox() {
  useFloatingBox.setState({ isEnabled:true, isFrozen: true });
}
