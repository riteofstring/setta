import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { addSectionInEmptySpace } from "state/actions/sections/createSections";
import { useSettings } from "state/definitions";
import { shortcutPrettified } from "utils/utils";
import { create } from "zustand";

export const useFloatingBox = create((set) => ({
  isFrozen: false,
  isEnabled: false,
  content: null,
  title: null,
}));

let mouseMoved = false;

export const FloatingBox = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const { isEnabled, content, title, isFrozen } = useFloatingBox();
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
  }, [isFrozen]);

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

  if (!isEnabled || !(content || title) || !mouseMoved) return null;

  return (
    <div
      ref={boxRef}
      className="fixed left-0 top-0 z-50 flex max-h-96 w-64 flex-col rounded-2xl border border-setta-200 bg-white p-4 shadow-lg dark:border-setta-700 dark:bg-setta-950"
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
      {!!content && <Footer isFrozen={isFrozen} />}
    </div>
  );
};

function Footer({ isFrozen }) {
  const {
    tooltipToSectionShortcut,
    freezeTooltipShortcut,
    frozenTooltipToSectionShortcut,
  } = useSettings((x) =>
    _.mapValues(
      _.pick(x, [
        "tooltipToSectionShortcut",
        "freezeTooltipShortcut",
        "frozenTooltipToSectionShortcut",
      ]),
      shortcutPrettified,
    ),
  );
  const className =
    "mt-4 border-t border-solid border-setta-100 pt-1 text-xs text-setta-500 dark:border-setta-700 dark:text-setta-600";

  if (isFrozen) {
    return (
      <p className={className}>
        press <span className="font-black">&quot;Esc&quot;</span> to close, or{" "}
        <span className="font-black">
          &quot;{frozenTooltipToSectionShortcut}&quot;
        </span>{" "}
        to open tooltip as new section
      </p>
    );
  }

  return (
    <p className={className}>
      press{" "}
      <span className="font-black">&quot;{tooltipToSectionShortcut}&quot;</span>{" "}
      to open tooltip as new section, or{" "}
      <span className="font-black">&quot;{freezeTooltipShortcut}&quot;</span> to
      freeze tooltip
    </p>
  );
}

export function getFloatingBoxHandlers(content, title) {
  function onMouseOver() {
    if ((content || title) && !useFloatingBox.getState().isFrozen) {
      useFloatingBox.setState({ content, title });
    }
  }

  function onMouseLeave() {
    if (!useFloatingBox.getState().isFrozen) {
      useFloatingBox.setState({ content: null, title: null });
    }
  }

  return { onMouseOver, onMouseLeave };
}

function isInput(event) {
  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target.isContentEditable
  );
}

export function enableFloatingBox(event) {
  if (isInput(event)) {
    return;
  }
  useFloatingBox.setState({ isEnabled: true });
}

export function disableFloatingBox() {
  useFloatingBox.setState({ isEnabled: false });
}

export function convertFloatingBoxToSection(event) {
  if (isInput(event)) {
    return;
  }
  const s = useFloatingBox.getState();
  if (s.content) {
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
  // if converting a frozen floating box, then we need to remove it
  removeFrozenFloatingBox();
}

export function freezeFloatingBox() {
  useFloatingBox.setState({ isEnabled: true, isFrozen: true });
}

export function removeFrozenFloatingBox() {
  useFloatingBox.setState({ isEnabled: false, isFrozen: false });
}
