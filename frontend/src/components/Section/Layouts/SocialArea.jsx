import getYouTubeID from "get-youtube-id";
import _ from "lodash";
import React from "react";
import { Tweet } from "react-twitter-widgets";
import YouTube from "react-youtube";
import { useSectionInfos } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { linkIsTwitter, linkIsYouTube } from "state/hooks/social";

function _SocialArea({ sectionId }) {
  const size = useSectionInfos((x) => x.x[sectionId].size);
  const url = useSectionInfos((x) => x.x[sectionId].social);

  if (linkIsYouTube(url)) {
    console.log("size", size);
    return <YoutubeEmbed size={size} url={url} />;
  } else if (linkIsTwitter(url)) {
    return <TwitterEmbed url={url} />;
  }
}

export const SocialArea = React.memo(_SocialArea);

function YoutubeEmbed({ size, url }) {
  const id = getYouTubeID(url, { fuzzy: false });
  const sizeWithMargin = { width: size.width, height: size.height - 24 };
  console.log("sizeWithMargin", sizeWithMargin);

  return (
    <div className="section-w-full section-row-main flex">
      <YouTube videoId={id} opts={sizeWithMargin} />
    </div>
  );
}

function TwitterEmbed({ url }) {
  const id = _.last(url.split("/")).split("?")[0];
  const [darkMode] = localStorageFns.darkMode.hook();

  return (
    id && (
      <div className="section-key-value section-row-main flex items-start justify-center overflow-auto [&>div]:contents [&_.twitter-tweet]:!m-0 [&_.twitter-tweet]:h-full [&_.twitter-tweet]:w-full [&_.twitter-tweet]:overflow-hidden [&_.twitter-tweet]:rounded-xl [&_.twitter-tweet]:border [&_.twitter-tweet]:border-none [&_.twitter-tweet]:pt-2 [&_div:has(.twitter-tweet)]:contents">
        <Tweet tweetId={id} options={darkMode ? { theme: "dark" } : {}} />
      </div>
    )
  );
}
