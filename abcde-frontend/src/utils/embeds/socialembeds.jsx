import { Tweet } from "react-twitter-widgets";
import YouTube from "react-youtube";

export function SocialEmbeds({ yt = true }) {
  return (
    <div
      className="grid h-full w-full place-items-center
 py-4 px-9 [&>div]:overflow-hidden [&>div]:rounded-xl [&>div]:border [&>div]:border-solid [&>div]:border-white [&>div]:shadow-lg [&_.twitter-tweet]:!m-0"
    >
      {yt ? <YoutubeEmbed /> : <TwitterEmbed />}
    </div>
  );
}

function YoutubeEmbed() {
  const opts = {
    height: "390",
    width: "640",
    // playerVars: {
    //   // https://developers.google.com/youtube/player_parameters
    //   autoplay: 1,
    // },
  };
  return <YouTube videoId="2g811Eo7K8U" opts={opts} />;
}

function TwitterEmbed() {
  return <Tweet tweetId="841418541026877441" />;
}
