import getYouTubeID from "get-youtube-id";
import _ from "lodash";
import React, {useRef, useEffect} from "react";
import { Tweet } from "react-tweet";
import { useSectionInfos } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { useYouTubeSectionSize } from "state/hooks/sectionSizes";
import { linkIsTwitter, linkIsYouTube } from "state/hooks/social";

function _SocialArea({ sectionId }) {
  const url = useSectionInfos((x) => x.x[sectionId].social);

  if (linkIsYouTube(url)) {
    return <YoutubeEmbed sectionId={sectionId} url={url} />;
  } else if (linkIsTwitter(url)) {
    return <TwitterEmbed url={url} />;
  }
}

export const SocialArea = React.memo(_SocialArea);

function YoutubeEmbed({ sectionId, url }) {
  const id = getYouTubeID(url, { fuzzy: false });
  const playerSize = useYouTubeSectionSize(sectionId);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;

    const preventDefault = (event) => {
      event.preventDefault();
    };

    // Add event listeners to prevent default behavior for wheel and touch events
    container.addEventListener('wheel', preventDefault, { passive: false, capture: true });
    container.addEventListener('touchmove', preventDefault, { passive: false, capture: true });

    // Clean up event listeners on component unmount
    return () => {
      container.removeEventListener('wheel', preventDefault, { capture: true });
      container.removeEventListener('touchmove', preventDefault, { capture: true });
    };
  }, []);


  return (
    <div ref={containerRef} className={`section-w-full section-row-main flex pointer-events-auto`}>
      <iframe
      className="pointer-events-auto"
        width={playerSize.width}
        height={playerSize.height}
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video player"
        // frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        // allowfullscreen
        // ref={bottomDivRef}
      />
      {/* <div
        className="pointer-events-none absolute inset-0"
        onWheel={handleWheel}
      ></div> */}
    </div>
  );
}

function TwitterEmbed({ url }) {
  const id = _.last(url.split("/")).split("?")[0];
  const [darkMode] = localStorageFns.darkMode.hook();

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
