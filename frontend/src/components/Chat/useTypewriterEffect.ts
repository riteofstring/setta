import { useEffect, useRef, useState } from "react";

export const useTypewriterEffect = (
  fullText: string,
  isStreaming = false,
  typingSpeed = 5,
) => {
  const [displayedText, setDisplayedText] = useState(fullText || "");
  const previousTextRef = useRef(fullText || "");
  const animationRef = useRef<number | null>(null);
  const indexRef = useRef(fullText ? fullText.length : 0);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (!fullText) {
      setDisplayedText("");
      previousTextRef.current = "";
      indexRef.current = 0;
      return;
    }

    if (!isStreaming) {
      setDisplayedText(fullText);
      previousTextRef.current = fullText;
      indexRef.current = fullText.length;
      return;
    }

    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      if (!isStreaming) {
        setDisplayedText(fullText);
        previousTextRef.current = fullText;
        indexRef.current = fullText.length;
        return;
      }
    }

    if (fullText !== previousTextRef.current) {
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

      previousTextRef.current = fullText;

      if (indexRef.current < commonPrefixLength) {
        indexRef.current = commonPrefixLength;
      }

      setDisplayedText(fullText.substring(0, indexRef.current));

      if (animationRef.current) {
        clearInterval(animationRef.current);
      }

      animationRef.current = setInterval(() => {
        if (indexRef.current < fullText.length) {
          indexRef.current++;
          setDisplayedText(fullText.substring(0, indexRef.current));
          return;
        }
        if (animationRef.current !== null) {
          clearInterval(animationRef.current);
        }
        animationRef.current = null;
      }, typingSpeed);
    }

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [fullText, isStreaming, typingSpeed]);

  return displayedText;
};
