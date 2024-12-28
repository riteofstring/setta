import Chart from "chart.js/auto";
import React, { useRef } from "react";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";

function _LinePlotArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["value"]);
  const canvasRef = useRef();
  const xAxisColumn = "input_value";

  useDeepCompareEffect(() => {
    if (!loadedArtifacts || Object.keys(loadedArtifacts).length === 0) return;

    const artifactData = Object.values(loadedArtifacts)[0].value;
    const xColumnIndex = artifactData.headers.indexOf(xAxisColumn);

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: artifactData.data.map((row) => row[xColumnIndex]),
        datasets: artifactData.headers
          .map((header, index) => ({
            header,
            index,
          }))
          .filter(({ index }) => index !== xColumnIndex)
          .map(({ header, index }) => ({
            label: header,
            data: artifactData.data.map((row) => row[index]),
          })),
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "linear",
            ticks: {
              stepSize: Math.ceil(
                (artifactData.data.slice(-1)[0][xColumnIndex] -
                  artifactData.data[0][xColumnIndex]) /
                  5,
              ),
              precision: 0,
            },
          },
        },
      },
    });

    return () => {
      chart.destroy();
    };
  }, [loadedArtifacts, xAxisColumn]);

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <canvas ref={canvasRef} />
    </figure>
  );
}

export const LinePlotArea = React.memo(_LinePlotArea);

// import { ParentSize } from "@visx/responsive";
// import { LineChart } from "components/Utils/Charts/LineChart";
// import React from "react";
// import { useAllSectionArtifacts } from "state/hooks/artifacts";

// function _LinePlotArea({ sectionId }) {
//   const loadedArtifacts = useAllSectionArtifacts(sectionId, ["name", "value"]);
//   return <LinePlotAreaCore series={loadedArtifacts} />;
// }

// export const LinePlotArea = React.memo(_LinePlotArea);

// function LinePlotAreaCore({ series }) {
//   const seriesWithX = [];
//   for (const data of Object.values(series)) {
//     seriesWithX.push({
//       name: data.name,
//       values: data.value.map((y, i) => ({ x: i, y })),
//     });
//   }

//   console.log("seriesWithX", seriesWithX)

//   // ParentSize has min-w-0 and min-h-0 to avoid resizing bug:
//   // https://github.com/airbnb/visx/issues/1014#issuecomment-1180677878
//   return (
//     <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
//       <ParentSize
//         className="single-cell-child -my-2 min-h-0 min-w-0 py-1"
//         debounceTime={0}
//       >
//         {(parent) => (
//           <LineChart
//             width={parent.width}
//             height={parent.height}
//             series={seriesWithX}
//           />
//         )}
//       </ParentSize>
//     </figure>
//   );
// }
