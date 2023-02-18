import { Tweet } from "react-twitter-widgets";
import YouTube from "react-youtube";

export function SocialEmbeds({ yt = true }) {
  return <>{yt ? <YoutubeEmbed /> : <TwitterEmbed />}</>;
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
