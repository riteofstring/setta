import { useEffect, useRef, useState } from "react";

export const useTypewriterEffect = (
  fullText,
  isStreaming = false,
  typingSpeed = 5,
) => {
  const [displayedText, setDisplayedText] = useState("");
  const previousTextRef = useRef("");
  const animationRef = useRef(null);
  const indexRef = useRef(0);

  // Set up the typewriter effect
  useEffect(() => {
    // If no text, reset and return
    if (!fullText) {
      setDisplayedText("");
      previousTextRef.current = "";
      indexRef.current = 0;
      return;
    }

    // If text changes but not streaming, or on first load, show full text
    if (!isStreaming || previousTextRef.current === "") {
      setDisplayedText(fullText);
      previousTextRef.current = fullText;
      indexRef.current = fullText.length;
      return;
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
          clearInterval(animationRef.current);
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
