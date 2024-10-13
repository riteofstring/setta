import getYouTubeID from "get-youtube-id";
import _ from "lodash";
import React from "react";
import { Tweet } from "react-tweet";
import YouTube from "react-youtube";
import { useSectionInfos } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import {
  useTwitterSectionSize,
  useYouTubeSectionSize,
} from "state/hooks/sectionSizes";
import { linkIsTwitter, linkIsYouTube } from "state/hooks/social";

function _SocialArea({ sectionId }) {
  const url = useSectionInfos((x) => x.x[sectionId].social);

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
  const resizeEvent = useSectionInfos((x) => x.x[sectionId].resizeEvent);
  const pointerCSS = resizeEvent === "start" ? "pointer-events-none" : "";

  return (
    <div className={`section-w-full section-row-main flex ${pointerCSS}`}>
      <YouTube videoId={id} opts={playerSize} />
    </div>
  );
}

function TwitterEmbed({ sectionId, url }) {
  const id = _.last(url.split("/")).split("?")[0];
  const [darkMode] = localStorageFns.darkMode.hook();
  useTwitterSectionSize(sectionId);

  return (
    id && (
      <div
        data-theme={darkMode ? "dark" : "light"} // needed by react-tweet
        className="section-key-value section-row-main flex items-start justify-center overflow-auto [&>div]:contents [&_.twitter-tweet]:!m-0 [&_.twitter-tweet]:h-full [&_.twitter-tweet]:w-full [&_.twitter-tweet]:overflow-hidden [&_.twitter-tweet]:rounded-xl [&_.twitter-tweet]:border [&_.twitter-tweet]:border-none [&_.twitter-tweet]:pt-2 [&_div:has(.twitter-tweet)]:contents"
      >
        <Tweet id={id} />
      </div>
    )
  );
}
