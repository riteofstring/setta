import getYouTubeID from "get-youtube-id";
import _ from "lodash";
import React from "react";
import { Tweet } from "react-twitter-widgets";
import YouTube from "react-youtube";
import { useSectionInfos } from "state/definitions";
import { linkIsTwitter, linkIsYouTube } from "state/hooks";

function _SocialArea({ sectionId }) {
  const size = useSectionInfos((x) => x.x[sectionId].size);
  const url = useSectionInfos((x) => x.x[sectionId].social);

  if (linkIsYouTube(url)) {
    return <YoutubeEmbed size={size} url={url} />;
  } else if (linkIsTwitter(url)) {
    return <TwitterEmbed url={url} />;
  }
}

export const SocialArea = React.memo(_SocialArea);

function YoutubeEmbed({ size, url }) {
  const id = getYouTubeID(url, { fuzzy: false });
  const sizeWithMargin = { width: size.width - 50, height: size.height - 100 };

  return (
    <div
      className="grid h-full w-full place-items-center
px-9 py-4 [&>div]:overflow-hidden [&>div]:rounded-xl [&>div]:border [&>div]:border-solid [&>div]:border-white [&>div]:shadow-lg [&_.twitter-tweet]:!m-0 "
    >
      <YouTube videoId={id} opts={sizeWithMargin} />
    </div>
  );
}

function TwitterEmbed({ url }) {
  const id = _.last(url.split("/")).split("?")[0];

  return (
    id && (
      <div
        className="grid h-full w-full place-items-center
px-9 py-4 [&>div]:contents [&_.twitter-tweet]:!m-0 [&_.twitter-tweet]:overflow-hidden [&_.twitter-tweet]:rounded-xl [&_.twitter-tweet]:border [&_.twitter-tweet]:border-solid [&_.twitter-tweet]:border-white [&_.twitter-tweet]:shadow-lg [&_div:has(.twitter-tweet)]:contents"
      >
        <Tweet tweetId={id} />
      </div>
    )
  );
}
