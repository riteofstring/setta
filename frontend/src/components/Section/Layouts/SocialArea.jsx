import getYouTubeID from "get-youtube-id";
import _ from "lodash";
import React, { useRef } from "react";
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
  const frameRef = useRef();
  const topDivRef = useRef(null);
  const bottomDivRef = useRef(null);

  const handleTopClick = (e) => {
    e.preventDefault(); // Prevent any default behavior

    if (topDivRef.current && bottomDivRef.current) {
      // Temporarily hide the top div
      topDivRef.current.style.display = "none";

      // Get the element at the click coordinates
      const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
      console.log("elementAtPoint", elementAtPoint)

      // Show the top div again
      topDivRef.current.style.display = "";

      if (elementAtPoint && bottomDivRef.current.contains(elementAtPoint)) {
        // Create a new click event
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: e.clientX,
          clientY: e.clientY,
        });

        // Dispatch the event on the element at the click coordinates
        elementAtPoint.dispatchEvent(clickEvent);
      }
    }
  };

  const handleBottomClick = (e) => {
    // Using getBoundingClientRect to get click position relative to the div
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    console.log(
      `Clicked bottom div at position (${x.toFixed(2)}, ${y.toFixed(2)})`,
    );
  };

  return (
    <div className="section-w-full section-row-main flex">
      <div
        className="absolute inset-0"
        ref={topDivRef}
        onClick={handleTopClick}
      />
      {/* <object
        width={playerSize.width}
        height={playerSize.height}
        data={`https://www.youtube.com/embed/${id}`}
        // onTouchStart={() => {
        //   console.log("on touch start");
        // }}
        ref={frameRef}
      /> */}

      <iframe
        width={playerSize.width}
        height={playerSize.height}
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video player"
        // frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        // allowfullscreen
        ref={bottomDivRef}
        onClick={handleBottomClick}
      />
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
