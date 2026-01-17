import { useEffect, useRef, useState } from "react";

export const useTypewriterEffect = (
  fullText: string,
  isStreaming = false,
  typingSpeed = 5,
) => {
  // Initialize state with the full text to avoid empty initial render
  const [displayedText, setDisplayedText] = useState(fullText || "");
  const previousTextRef = useRef(fullText || "");
  const animationRef = useRef<number | null>(null);
  const indexRef = useRef(fullText ? fullText.length : 0);
  const firstRenderRef = useRef(true);

  // Set up the typewriter effect
  useEffect(() => {
    // If no text, reset and return
    if (!fullText) {
      setDisplayedText("");
      previousTextRef.current = "";
      indexRef.current = 0;
      return;
    }

    // If not streaming or this is a remount, show full text immediately
    if (!isStreaming) {
      setDisplayedText(fullText);
      previousTextRef.current = fullText;
      indexRef.current = fullText.length;
      return;
    }

    // Handle first render - synchronize immediately to avoid flicker
    if (firstRenderRef.current) {
      firstRenderRef.current = false;

      // On first render with existing content that's not streaming, show immediately
      if (!isStreaming) {
        setDisplayedText(fullText);
        previousTextRef.current = fullText;
        indexRef.current = fullText.length;
        return;
      }
    }

    // If this is new text and we're streaming
    if (fullText !== previousTextRef.current) {
      // Find the common prefix between previous and current text
      let commonPrefixLength = 0;
      const minLength = Math.min(
        previousTextRef.current.length,
        fullText.length,
      );

      while (
        commonPrefixLength < minLength &&
        previousTextRef.current[commonPrefixLength] ===
          fullText[commonPrefixLength]
      ) {
        commonPrefixLength++;
      }

      // Update state variables
      previousTextRef.current = fullText;

      // If we already have content displayed, start from there
      if (indexRef.current < commonPrefixLength) {
        indexRef.current = commonPrefixLength;
      }

      // Immediately display what we've already seen
      setDisplayedText(fullText.substring(0, indexRef.current));

      // Clear any existing animation
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }

      // Start the animation from the current index
      animationRef.current = setInterval(() => {
        if (indexRef.current < fullText.length) {
          indexRef.current++;
          setDisplayedText(fullText.substring(0, indexRef.current));
        } else {
          if (animationRef.current !== null) {
            clearInterval(animationRef.current);
          }
          animationRef.current = null;
        }
      }, typingSpeed);
    }

    // Cleanup on unmount
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [fullText, isStreaming, typingSpeed]);

  return displayedText;
};
