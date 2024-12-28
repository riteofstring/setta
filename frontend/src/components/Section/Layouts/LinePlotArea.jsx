import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useSimulatedData(originalData, updateInterval = 1000) {
  const [simulatedData, setSimulatedData] = useState(() =>
    _.cloneDeep(originalData),
  );

  useEffect(() => {
    if (!originalData || Object.keys(originalData).length === 0) return;

    // Update state when originalData changes
    setSimulatedData(_.cloneDeep(originalData));

    const intervalId = setInterval(() => {
      setSimulatedData((prevData) => {
        const newData = _.cloneDeep(prevData);
        const artifactId = Object.keys(newData)[0];
        const artifact = newData[artifactId];
        const data = artifact.value.data;

        // Get the last input value and increment it
        const lastRow = data[data.length - 1];
        const nextInputValue = lastRow[0] + (data[1][0] - data[0][0]); // Use same step size

        // Generate new values following the patterns
        const newRow = [
          nextInputValue,
          Math.sin(nextInputValue), // sine_wave
          Math.cos(nextInputValue), // cosine_wave
          Math.sin(nextInputValue) * Math.exp(-Math.abs(nextInputValue / 10)), // damped_oscillation
          nextInputValue * nextInputValue, // quadratic
        ];

        // Add the new row
        artifact.value.data = [...data, newRow];

        return newData;
      });
    }, updateInterval);

    return () => clearInterval(intervalId);
  }, [originalData, updateInterval]);

  return simulatedData;
}

function _LinePlotArea({ sectionId }) {
  const loadedArtifacts = useAllSectionArtifacts(sectionId, ["value"]);
  const simulatedData = useSimulatedData(loadedArtifacts);
  const size = useSectionInfos((x) => x.x[sectionId].size, _.isEqual);
  const canvasRef = useRef();
  const chartRef = useRef(null);
  const xAxisColumn = "input_value";
  const secondYAxisColumns = ["quadratic"];

  // Effect for chart lifecycle (creation and destruction)
  useDeepCompareEffect(() => {
    console.log('creating chart')
    // Create initial chart with basic configuration
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: [],
        datasets: [],
      },
      options: {
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "linear",
          },
          y1: {
            type: "linear",
            position: "left",
          },
          y2: {
            type: "linear",
            position: "right",
            grid: {
              drawOnChartArea: false,
            },
            display: secondYAxisColumns.length > 0,
          },
        },
      },
    });

    // Cleanup only on unmount
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [secondYAxisColumns]); // Only depends on secondYAxisColumns for y2 axis display

  // Effect for data updates and data-dependent configuration
  useDeepCompareEffect(() => {
    console.log("updating chart")
    if (
      !simulatedData ||
      Object.keys(simulatedData).length === 0 ||
      !chartRef.current
    )
      return;

    const artifactData = Object.values(simulatedData)[0].value;
    const xColumnIndex = artifactData.headers.indexOf(xAxisColumn);

    // Update data
    const newData = {
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
          yAxisID: secondYAxisColumns.includes(header) ? "y2" : "y1",
        })),
    };

    // Update data-dependent options
    chartRef.current.options.scales.x.ticks = {
      stepSize: Math.ceil(
        (artifactData.data.slice(-1)[0][xColumnIndex] -
          artifactData.data[0][xColumnIndex]) /
          5,
      ),
      precision: 0,
    };

    // Update chart with new data and options
    chartRef.current.data = newData;
    chartRef.current.update();
    chartRef.current.resize(size.width, size.height - 50);
  }, [simulatedData, xAxisColumn, secondYAxisColumns, size]);

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
