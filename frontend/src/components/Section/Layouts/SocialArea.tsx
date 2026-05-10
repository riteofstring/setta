import getYouTubeID from "get-youtube-id";
import _ from "lodash";
import React, { useState } from "react";
import { Tweet } from "react-tweet";
import YouTube from "react-youtube";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  useResizeEvent,
} from "state/definitions";
import {
  useTwitterSectionSize,
  useYouTubeSectionSize,
} from "state/hooks/sectionSizes";
import { linkIsTwitter, linkIsYouTube } from "state/hooks/social";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";

const SOCIAL_GPU_CONTROL_PREFIX = "social";
const SOCIAL_GPU_GUARD_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
const SOCIAL_GPU_WHEEL_GUARD_CLASS_NAME = `${SOCIAL_GPU_GUARD_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`;

function _SocialArea({ sectionId }) {
  const url = useProjectState((p) => {
    const impl = getCurrEffectiveSectionImplOfType(
      p,
      sectionId,
      SectionTypeEnum.Social,
    );
    return impl.url;
  });

  if (linkIsYouTube(url)) {
    return <YoutubeEmbed sectionId={sectionId} url={url} />;
  } else if (linkIsTwitter(url)) {
    return <TwitterEmbed sectionId={sectionId} url={url} />;
  }
}

export const SocialArea = React.memo(_SocialArea);

function YoutubeEmbed({ sectionId, url }) {
  const id = getYouTubeID(url, { fuzzy: false });
  const playerSize = useYouTubeSectionSize(sectionId);
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const pointerCSS = resizeEvent === "start" ? "pointer-events-none" : "";
  const [showVideo, setShowVideo] = useState(false);
  const thumbnailUrl = `https://img.youtube.com/vi/${id}/0.jpg`;

  const handleThumbnailClick = () => {
    setShowVideo(true);
  };
  const opts = { ...playerSize, playerVars: { autoplay: 1 } };

  return (
    <div
      className={`${SOCIAL_GPU_WHEEL_GUARD_CLASS_NAME} section-w-full section-row-left-bottom flex ${pointerCSS}`}
      data-gpu-flow-control={`${SOCIAL_GPU_CONTROL_PREFIX}:youtube:${sectionId}`}
      data-gpu-flow-interactive="true"
      data-gpu-flow-wheel-target="true"
    >
      {!showVideo ? (
        <div
          className={`${SOCIAL_GPU_GUARD_CLASS_NAME} relative w-full cursor-pointer`}
          data-gpu-flow-control={`${SOCIAL_GPU_CONTROL_PREFIX}:youtube-thumbnail:${sectionId}`}
          data-gpu-flow-interactive="true"
          onClick={handleThumbnailClick}
        >
          <img
            src={thumbnailUrl}
            alt="YouTube video thumbnail"
            className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} h-full w-full object-cover`}
            data-gpu-flow-control={`${SOCIAL_GPU_CONTROL_PREFIX}:youtube-thumbnail-image:${sectionId}`}
            data-gpu-flow-interactive="true"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* <svg
              className="h-20 w-20 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg> */}
            <YoutubeIcon />
          </div>
        </div>
      ) : (
        <YouTube videoId={id} opts={opts} />
      )}
    </div>
  );
}

function TwitterEmbed({ sectionId, url }) {
  const id = _.last(url.split("/")).split("?")[0];
  const darkMode = useLocalStorage((x) => x.darkMode);
  useTwitterSectionSize(sectionId);

  return (
    id && (
      <div
        data-theme={darkMode ? "dark" : "light"} // needed by react-tweet
        className={`${SOCIAL_GPU_WHEEL_GUARD_CLASS_NAME} section-key-value section-row-main flex items-start justify-center overflow-auto [&>div]:contents [&_.twitter-tweet]:!m-0 [&_.twitter-tweet]:h-full [&_.twitter-tweet]:w-full [&_.twitter-tweet]:overflow-hidden [&_.twitter-tweet]:rounded-xl [&_.twitter-tweet]:border [&_.twitter-tweet]:border-none [&_.twitter-tweet]:pt-2 [&_div:has(.twitter-tweet)]:contents`}
        data-gpu-flow-control={`${SOCIAL_GPU_CONTROL_PREFIX}:twitter:${sectionId}`}
        data-gpu-flow-interactive="true"
        data-gpu-flow-wheel-target="true"
      >
        <Tweet id={id} />
      </div>
    )
  );
}

function YoutubeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="external-icon h-20 w-20"
      viewBox="0 0 28.57  20"
      focusable="false"
      // style="pointer-events: none; display: block;"
    >
      <svg
        viewBox="0 0 28.57 20"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <path
            d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"
            fill="#FF0000"
          ></path>
          <path
            d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z"
            fill="white"
          ></path>
        </g>
      </svg>
    </svg>
  );
}
