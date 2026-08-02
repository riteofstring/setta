import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type TypewriterOptions = {
  typingSpeed?: number;
  baseMaxCharsPerFrame?: number;
  maxCharsPerFrameCap?: number;
};

type ResolvedTypewriterOptions = {
  typingSpeed: number;
  baseMaxCharsPerFrame: number;
  maxCharsPerFrameCap: number;
};

type SetDisplayedText = Dispatch<SetStateAction<string>>;

type TypewriterAnimationState = {
  animationId: number | null;
  carryChars: number;
  displayedLength: number;
  lastFrameTimestamp: number | null;
  targetText: string;
  typingSpeed: number;
};

type FrameAdvance = {
  nextCarryChars: number;
  nextDisplayedLength: number;
  nextTimestamp: number;
};

function resolveTypewriterOptions(
  typingSpeedOrOptions: number | TypewriterOptions,
): ResolvedTypewriterOptions {
  const resolvedOptions =
    typeof typingSpeedOrOptions === "number"
      ? { typingSpeed: typingSpeedOrOptions }
      : typingSpeedOrOptions;
  const baseMaxCharsPerFrame = Math.max(
    1,
    resolvedOptions.baseMaxCharsPerFrame ?? 2,
  );
  return {
    typingSpeed: Math.max(1, resolvedOptions.typingSpeed ?? 5),
    baseMaxCharsPerFrame,
    maxCharsPerFrameCap: Math.max(
      baseMaxCharsPerFrame,
      resolvedOptions.maxCharsPerFrameCap ?? 10,
    ),
  };
}

function createAnimationState(
  fullText: string,
  typingSpeed: number,
): TypewriterAnimationState {
  const normalizedText = fullText || "";
  return {
    animationId: null,
    carryChars: 0,
    displayedLength: normalizedText.length,
    lastFrameTimestamp: null,
    targetText: normalizedText,
    typingSpeed,
  };
}

function resetAnimationProgress(state: TypewriterAnimationState) {
  state.animationId = null;
  state.lastFrameTimestamp = null;
  state.carryChars = 0;
}

function setDisplayedTextIfChanged(
  setDisplayedText: SetDisplayedText,
  nextText: string,
) {
  setDisplayedText((previousText) =>
    previousText === nextText ? previousText : nextText,
  );
}

function syncSettledText(
  state: TypewriterAnimationState,
  nextText: string,
  setDisplayedText: SetDisplayedText,
) {
  state.targetText = nextText;
  state.displayedLength = nextText.length;
  setDisplayedTextIfChanged(setDisplayedText, nextText);
}

function getCommonPrefixLength(previousText: string, nextText: string) {
  let commonPrefixLength = 0;
  const minLength = Math.min(previousText.length, nextText.length);
  while (
    commonPrefixLength < minLength &&
    previousText[commonPrefixLength] === nextText[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }
  return commonPrefixLength;
}

function syncStreamingText(
  state: TypewriterAnimationState,
  nextText: string,
  setDisplayedText: SetDisplayedText,
) {
  const commonPrefixLength = getCommonPrefixLength(state.targetText, nextText);
  state.targetText = nextText;
  if (state.displayedLength <= commonPrefixLength) {
    return;
  }
  state.displayedLength = commonPrefixLength;
  setDisplayedTextIfChanged(
    setDisplayedText,
    nextText.substring(0, commonPrefixLength),
  );
}

function computeFrameAdvance({
  timestamp,
  displayedLength,
  targetLength,
  previousTimestamp,
  carryChars,
  typingSpeed,
  baseMaxCharsPerFrame,
  maxCharsPerFrameCap,
}: {
  timestamp: number;
  displayedLength: number;
  targetLength: number;
  previousTimestamp: number | null;
  carryChars: number;
  typingSpeed: number;
  baseMaxCharsPerFrame: number;
  maxCharsPerFrameCap: number;
}): FrameAdvance | null {
  if (displayedLength >= targetLength) {
    return null;
  }
  const deltaMs = Math.min(
    34,
    Math.max(0, timestamp - (previousTimestamp ?? timestamp)),
  );
  const backlog = Math.max(0, targetLength - displayedLength);
  const catchUpMultiplier = 1 + Math.min(2.5, backlog / 160);
  const nextCarryChars =
    carryChars + (deltaMs / typingSpeed) * catchUpMultiplier;
  const rawCharsToReveal = Math.floor(nextCarryChars);
  if (rawCharsToReveal <= 0) {
    return {
      nextCarryChars,
      nextDisplayedLength: displayedLength,
      nextTimestamp: timestamp,
    };
  }
  const dynamicMaxCharsPerFrame = Math.min(
    maxCharsPerFrameCap,
    baseMaxCharsPerFrame + Math.floor(backlog / 140),
  );
  const charsToReveal = Math.min(rawCharsToReveal, dynamicMaxCharsPerFrame);
  return {
    nextCarryChars: nextCarryChars - charsToReveal,
    nextDisplayedLength: Math.min(
      targetLength,
      displayedLength + charsToReveal,
    ),
    nextTimestamp: timestamp,
  };
}

export const useTypewriterEffect = (
  fullText: string,
  isStreaming = false,
  typingSpeedOrOptions: number | TypewriterOptions = 5,
) => {
  const { typingSpeed, baseMaxCharsPerFrame, maxCharsPerFrameCap } =
    resolveTypewriterOptions(typingSpeedOrOptions);
  const [displayedText, setDisplayedText] = useState(fullText || "");
  const animationStateRef = useRef<TypewriterAnimationState>(
    createAnimationState(fullText, typingSpeed),
  );

  const stopAnimation = useCallback(() => {
    const animationState = animationStateRef.current;
    if (animationState.animationId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(animationState.animationId);
    }
    resetAnimationProgress(animationState);
  }, []);

  const animateFrame = useCallback(
    (timestamp: number) => {
      const animationState = animationStateRef.current;
      const frameAdvance = computeFrameAdvance({
        timestamp,
        displayedLength: animationState.displayedLength,
        targetLength: animationState.targetText.length,
        previousTimestamp: animationState.lastFrameTimestamp,
        carryChars: animationState.carryChars,
        typingSpeed: animationState.typingSpeed,
        baseMaxCharsPerFrame,
        maxCharsPerFrameCap,
      });
      if (!frameAdvance) {
        resetAnimationProgress(animationState);
        return;
      }
      animationState.lastFrameTimestamp = frameAdvance.nextTimestamp;
      animationState.carryChars = frameAdvance.nextCarryChars;
      if (frameAdvance.nextDisplayedLength !== animationState.displayedLength) {
        animationState.displayedLength = frameAdvance.nextDisplayedLength;
        setDisplayedTextIfChanged(
          setDisplayedText,
          animationState.targetText.substring(
            0,
            frameAdvance.nextDisplayedLength,
          ),
        );
      }
      animationState.animationId = window.requestAnimationFrame(animateFrame);
    },
    [baseMaxCharsPerFrame, maxCharsPerFrameCap],
  );

  const startAnimation = useCallback(() => {
    const animationState = animationStateRef.current;
    if (typeof window === "undefined" || animationState.animationId !== null) {
      return;
    }
    animationState.animationId = window.requestAnimationFrame(animateFrame);
  }, [animateFrame]);

  useEffect(() => {
    animationStateRef.current.typingSpeed = typingSpeed;
  }, [typingSpeed]);

  useEffect(() => {
    const normalizedText = fullText || "";
    const animationState = animationStateRef.current;
    if (normalizedText.length === 0) {
      stopAnimation();
      animationState.targetText = "";
      animationState.displayedLength = 0;
      setDisplayedTextIfChanged(setDisplayedText, "");
      return;
    }

    if (!isStreaming) {
      stopAnimation();
      syncSettledText(animationState, normalizedText, setDisplayedText);
      return;
    }

    syncStreamingText(animationState, normalizedText, setDisplayedText);
    if (animationState.displayedLength < normalizedText.length) {
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
