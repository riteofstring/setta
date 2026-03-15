import _ from "lodash";
import { useEffect, useState } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getSectionType } from "state/actions/sectionStructureQueries";
import {
  adjustAspectRatio,
  adjustSizeToBeAtLeastMin,
} from "state/actions/sections/sectionSizeGeometry";
import { setSectionSize } from "state/actions/sections/sectionSizeState";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { useSettings } from "state/stores/uiPreferenceStores";
import { type SectionSize } from "utils/generatedTypes";
import {
  getMinSectionHeight,
  getMinSectionWidth,
} from "./sectionSizingPolicyDims";

type ImageArtifactLike = {
  width: number;
  height: number;
  src: string;
};

type AspectRatioInfoUpdate = {
  sectionId: string;
  size?: Partial<SectionSize>;
  aspectRatio: number | null;
  aspectRatioExtraHeight: number | null;
  aspectRatioExtraWidth?: number | null;
  state: ZustandProjectState;
};

function setSectionToHaveAspectRatioAndMinSize(
  sectionId: string,
  imgSize: { width: number; height: number },
) {
  const sectionType = getSectionType(sectionId);
  const state = useProjectState.getState();
  const sizingPolicy = useSettings.getState().sectionSizingPolicy;
  const minHeight = getMinSectionHeight({ sectionType, sizingPolicy });
  const minWidth = getMinSectionWidth({
    sectionType,
    sizingPolicy,
  });
  const currSize = state.sections[sectionId].size;

  let adjustedSize = adjustAspectRatio(
    currSize.height,
    currSize.width,
    imgSize.height,
    imgSize.width,
  );
  adjustedSize = adjustSizeToBeAtLeastMin(
    adjustedSize.height,
    adjustedSize.width,
    minHeight,
    minWidth,
  );

  const extraHeight = 24;
  adjustedSize.height += extraHeight;
  useProjectState.setState((nextState) => {
    setAspectRatioInfo({
      sectionId,
      aspectRatio: imgSize.width / imgSize.height,
      aspectRatioExtraHeight: extraHeight,
      size: adjustedSize,
      state: nextState,
    });
  });
}

function useImgArtifactAreaSize(sectionId: string, image: ImageArtifactLike) {
  const [imgSize, setImgSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const widthOrHeightIsAuto = useProjectState((x) => {
    const { width, height } = x.sections[sectionId].size;
    return width === "auto" || height === "auto";
  });

  useEffect(() => {
    const nextSize = { width: image.width, height: image.height };
    if (!_.isEqual(nextSize, imgSize)) {
      setSectionToHaveAspectRatioAndMinSize(sectionId, nextSize);
    }
    setImgSize(nextSize);
  }, [image.src]);

  useEffect(() => {
    if (imgSize) {
      setSectionToHaveAspectRatioAndMinSize(sectionId, imgSize);
    }
  }, [widthOrHeightIsAuto]);

  return imgSize !== null;
}

export function setDrawAreaSectionSize(
  sectionId: string,
  sectionSize: SectionSize,
  state: ZustandProjectState,
) {
  let canvasSize = { height: 0, width: 0 };
  const extraHeight = 120;
  const extraWidth = 24;
  const { width: sWidth, height: sHeight } = sectionSize;

  const [defaultWidth, defaultHeight] = [500, 500];
  canvasSize.width = sWidth === "auto" ? defaultWidth : sWidth - extraWidth;
  canvasSize.height =
    sHeight === "auto" ? defaultHeight : sHeight - extraHeight;
  if (sWidth === "auto" || sHeight === "auto") {
    setSectionSize(
      sectionId,
      {
        width: canvasSize.width + extraWidth,
        height: canvasSize.height + extraHeight,
      },
      state,
    );
  }

  return canvasSize;
}

export function useYouTubeSectionSize(sectionId: string) {
  const extraHeight = 22;
  const defaultSize = { width: 640, height: 360 };
  const { width, height } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.size;
  }, _.isEqual);

  function setToDefaultSize() {
    defaultSize.height += extraHeight;
    useProjectState.setState((state) => {
      setAspectRatioInfo({
        sectionId,
        aspectRatio: 16 / 9,
        aspectRatioExtraHeight: extraHeight,
        size: defaultSize,
        state,
      });
    });
  }

  useEffect(() => {
    if (width === "auto" || height === "auto") {
      setToDefaultSize();
    }
  }, [width, height]);

  useEffect(() => {
    setSectionToHaveAspectRatioAndMinSize(sectionId, defaultSize);
  }, []);

  const playerSize =
    width === "auto" || height === "auto"
      ? {}
      : { width, height: height - extraHeight };

  return playerSize;
}

export function useTwitterSectionSize(sectionId: string) {
  useEffect(() => {
    useProjectState.setState((state) => {
      setAspectRatioInfo({
        sectionId,
        aspectRatio: null,
        aspectRatioExtraHeight: null,
        aspectRatioExtraWidth: null,
        size: { height: "auto" },
        state,
      });
    });
  }, []);
}

function setAspectRatioInfo({
  sectionId,
  size,
  aspectRatio,
  aspectRatioExtraHeight,
  aspectRatioExtraWidth,
  state,
}: AspectRatioInfoUpdate) {
  const section = state.sections[sectionId];
  section.aspectRatio = aspectRatio;
  section.aspectRatioExtraHeight = aspectRatioExtraHeight;
  section.aspectRatioExtraWidth = aspectRatioExtraWidth;
  if (size) {
    setSectionSize(sectionId, size, state);
  }
}

export { useImgArtifactAreaSize };
