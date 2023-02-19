import getYouTubeID from "get-youtube-id";
import { useSectionInfos } from "models/info/sectionInfos";
import { useSectionSocialConfig } from "models/info/sectionSocialConfig";
import { Tweet } from "react-twitter-widgets";
import YouTube from "react-youtube";

export function SocialEmbeds({ sectionId, type }) {
  const socialConfig = useSectionSocialConfig((x) => x.x[sectionId]?.[type]);
  const size = useSectionInfos((x) => x.x[sectionId].size);

  if (type === "youtube") {
    return <YoutubeEmbed size={size} {...socialConfig} />;
  } else if (type === "twitter") {
    return <TwitterEmbed {...socialConfig} />;
  }
}

function YoutubeEmbed({ size, url }) {
  const id = getYouTubeID(url, { fuzzy: false });
  const sizeWithMargin = { width: size.width - 50, height: size.height - 100 };

  return (
    <div
      className="grid h-full w-full place-items-center
py-4 px-9 [&>div]:overflow-hidden [&>div]:rounded-xl [&>div]:border [&>div]:border-solid [&>div]:border-white [&>div]:shadow-lg [&_.twitter-tweet]:!m-0 "
    >
      <YouTube videoId={id} opts={sizeWithMargin} />
    </div>
  );
}

function TwitterEmbed({ url }) {
  return (
    <div
      className="grid h-full w-full place-items-center
py-4 px-9 [&>div]:contents [&_.twitter-tweet]:!m-0 [&_.twitter-tweet]:overflow-hidden [&_.twitter-tweet]:rounded-xl [&_.twitter-tweet]:border [&_.twitter-tweet]:border-solid [&_.twitter-tweet]:border-white [&_.twitter-tweet]:shadow-lg [&_div:has(.twitter-tweet)]:contents"
    >
      <Tweet tweetId="841418541026877441" />
    </div>
  );
}
