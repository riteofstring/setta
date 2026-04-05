import _ from "lodash";
import { useEffect, useState } from "react";
import { useSectionRefs } from "state/definitions";

export type ObservedSectionElementSize = {
  width: number;
  height: number;
};

export type ObservedSectionElementSizes = Record<
  string,
  ObservedSectionElementSize
>;

export function useObservedSectionElementSizes(
  sectionIds: Array<string>,
): ObservedSectionElementSizes {
  const sectionElements = useSectionRefs((state) => {
    const nextElements: Record<string, HTMLElement | null> = {};
    for (const sectionId of sectionIds) {
      nextElements[sectionId] = state.selfOnly[sectionId] ?? null;
    }
    return nextElements;
  }, _.isEqual);
  const [observedElementSizes, setObservedElementSizes] =
    useState<ObservedSectionElementSizes>({});

  useEffect(() => {
    const activeSectionIds = new Set(sectionIds);

    setObservedElementSizes((current) =>
      syncObservedSectionElementSizes(
        current,
        sectionElements,
        activeSectionIds,
      ),
    );

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const sectionIdsByElement = new Map<HTMLElement, string>();
    const observer = new ResizeObserver((entries) => {
      setObservedElementSizes((current) => {
        let next = current;

        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement)) {
            continue;
          }

          const sectionId = sectionIdsByElement.get(entry.target);
          if (!sectionId || !activeSectionIds.has(sectionId)) {
            continue;
          }

          const measuredSize = measureObservedSectionElement(entry.target);
          if (!measuredSize) {
            continue;
          }

          const previousSize = next[sectionId];
          if (
            previousSize?.width === measuredSize.width &&
            previousSize.height === measuredSize.height
          ) {
            continue;
          }

          if (next === current) {
            next = { ...current };
          }
          next[sectionId] = measuredSize;
        }

        return next;
      });
    });

    for (const [sectionId, element] of Object.entries(sectionElements)) {
      if (!element) {
        continue;
      }
      sectionIdsByElement.set(element, sectionId);
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, [sectionElements, sectionIds]);

  return observedElementSizes;
}

function syncObservedSectionElementSizes(
  current: ObservedSectionElementSizes,
  sectionElements: Record<string, HTMLElement | null>,
  activeSectionIds: Set<string>,
): ObservedSectionElementSizes {
  let next = current;

  for (const sectionId of Object.keys(current)) {
    if (activeSectionIds.has(sectionId) && sectionElements[sectionId]) {
      continue;
    }
    if (next === current) {
      next = { ...current };
    }
    delete next[sectionId];
  }

  for (const [sectionId, element] of Object.entries(sectionElements)) {
    if (!element || !activeSectionIds.has(sectionId)) {
      continue;
    }
    const measuredSize = measureObservedSectionElement(element);
    if (!measuredSize) {
      continue;
    }
    const previousSize = next[sectionId];
    if (
      previousSize?.width === measuredSize.width &&
      previousSize.height === measuredSize.height
    ) {
      continue;
    }
    if (next === current) {
      next = { ...current };
    }
    next[sectionId] = measuredSize;
  }

  return next;
}

function measureObservedSectionElement(
  element: HTMLElement,
): ObservedSectionElementSize | null {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}
