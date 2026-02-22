import { useCallback, useEffect, useRef, useState } from "react";

export const useTypewriterEffect = (
  fullText: string,
  isStreaming = false,
  typingSpeed = 5,
) => {
  const baseMaxCharsPerFrame = 2;
  const maxCharsPerFrameCap = 10;
  const [displayedText, setDisplayedText] = useState(fullText || "");
  const targetTextRef = useRef(fullText || "");
  const displayedLengthRef = useRef(fullText ? fullText.length : 0);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const carryCharsRef = useRef(0);
  const typingSpeedRef = useRef(Math.max(1, typingSpeed));

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    lastFrameTimestampRef.current = null;
    carryCharsRef.current = 0;
  }, []);

  const animateFrame = useCallback(
    (timestamp: number) => {
      const targetText = targetTextRef.current;
      const targetLength = targetText.length;
      const displayedLength = displayedLengthRef.current;
      if (displayedLength >= targetLength) {
        animationRef.current = null;
        lastFrameTimestampRef.current = null;
        carryCharsRef.current = 0;
        return;
      }
      const previousTimestamp = lastFrameTimestampRef.current ?? timestamp;
      const deltaMs = Math.min(34, Math.max(0, timestamp - previousTimestamp));
      lastFrameTimestampRef.current = timestamp;
      const backlog = Math.max(0, targetLength - displayedLength);
      const catchUpMultiplier = 1 + Math.min(2.5, backlog / 160);
      carryCharsRef.current +=
        (deltaMs / typingSpeedRef.current) * catchUpMultiplier;
      const rawCharsToReveal = Math.floor(carryCharsRef.current);
      if (rawCharsToReveal <= 0) {
        animationRef.current = window.requestAnimationFrame(animateFrame);
        return;
      }
      const dynamicMaxCharsPerFrame = Math.min(
        maxCharsPerFrameCap,
        baseMaxCharsPerFrame + Math.floor(backlog / 140),
      );
      const charsToReveal = Math.min(rawCharsToReveal, dynamicMaxCharsPerFrame);
      carryCharsRef.current -= charsToReveal;
      const nextLength = Math.min(targetLength, displayedLength + charsToReveal);
      if (nextLength !== displayedLength) {
        displayedLengthRef.current = nextLength;
        const nextText = targetText.substring(0, nextLength);
        setDisplayedText((previousText) =>
          previousText === nextText ? previousText : nextText,
        );
      }
      animationRef.current = window.requestAnimationFrame(animateFrame);
    },
    [baseMaxCharsPerFrame, maxCharsPerFrameCap],
  );

  const startAnimation = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (animationRef.current !== null) {
      return;
    }
    animationRef.current = window.requestAnimationFrame(animateFrame);
  }, [animateFrame]);

  useEffect(() => {
    typingSpeedRef.current = Math.max(1, typingSpeed);
  }, [typingSpeed]);

  useEffect(() => {
    const normalizedText = fullText || "";
    if (normalizedText.length === 0) {
      stopAnimation();
      setDisplayedText((previousText) =>
        previousText === "" ? previousText : "",
      );
      targetTextRef.current = "";
      displayedLengthRef.current = 0;
      return;
    }

    if (!isStreaming) {
      stopAnimation();
      setDisplayedText((previousText) =>
        previousText === normalizedText ? previousText : normalizedText,
      );
      targetTextRef.current = normalizedText;
      displayedLengthRef.current = normalizedText.length;
      return;
    }

    const previousTarget = targetTextRef.current;
    targetTextRef.current = normalizedText;
    let commonPrefixLength = 0;
    const minLength = Math.min(previousTarget.length, normalizedText.length);
    while (
      commonPrefixLength < minLength &&
      previousTarget[commonPrefixLength] === normalizedText[commonPrefixLength]
    ) {
      commonPrefixLength += 1;
    }

    if (displayedLengthRef.current > commonPrefixLength) {
      displayedLengthRef.current = commonPrefixLength;
      const nextPrefix = normalizedText.substring(0, commonPrefixLength);
      setDisplayedText((previousText) =>
        previousText === nextPrefix ? previousText : nextPrefix,
      );
    }
    if (displayedLengthRef.current < normalizedText.length) {
      startAnimation();
    }
  }, [fullText, isStreaming, startAnimation, stopAnimation]);

  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, [stopAnimation]);

  return displayedText;
};
