import Chart from "chart.js/auto";
import React, { useEffect, useRef } from "react";

const data = [
  { year: 2010, count: 10 },
  { year: 2011, count: 20 },
  { year: 2012, count: 15 },
  { year: 2013, count: 25 },
  { year: 2014, count: 22 },
  { year: 2015, count: 30 },
  { year: 2016, count: 28 },
];

function _LinePlotArea({ sectionId }) {
  const canvasRef = useRef();

  useEffect(() => {
    const chart = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: data.map((row) => row.year),
        datasets: [
          {
            label: "Acquisitions by year",
            data: data.map((row) => row.count),
          },
        ],
      },
      options: { maintainAspectRatio: false },
    });

    return () => {
      chart.destroy();
    };
  }, []);

  return (
    <figure className="section-w-full section-row-main single-cell-container h-auto w-full max-w-full overflow-clip">
      <canvas ref={canvasRef} className="bg-red-500" />
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
