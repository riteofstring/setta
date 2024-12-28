import Chart from "chart.js/auto";
import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useAllSectionArtifacts } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useSimulatedData(
  originalData,
  updateInterval = 1000,
  nullProbability = 0.2,
) {
  const [simulatedData, setSimulatedData] = useState(() =>
    _.cloneDeep(originalData),
  );

  // Helper function to randomly set a value to null based on probability
  const maybeSetNull = (value) => {
    return Math.random() < nullProbability ? null : value;
  };

  useEffect(() => {
    if (!originalData || Object.keys(originalData).length === 0) return;

    setSimulatedData(_.cloneDeep(originalData));

    const intervalId = setInterval(() => {
      setSimulatedData((prevData) => {
        const newData = _.cloneDeep(prevData);
        const artifactId = Object.keys(newData)[0];
        const artifact = newData[artifactId];
        const data = artifact.value.data;

        const lastRow = data[data.length - 1];
        const nextInputValue = lastRow[0] + (data[1][0] - data[0][0]);

        // Calculate new values
        const newValues = [
          nextInputValue, // Always keep the input value (x-axis)
          Math.sin(nextInputValue),
          Math.cos(nextInputValue),
          Math.sin(nextInputValue) * Math.exp(-Math.abs(nextInputValue / 10)),
          nextInputValue * nextInputValue,
        ];

        // Randomly set some values to null, except for the first value (x-axis)
        const newRow = [
          newValues[0],
          ...newValues.slice(1).map((value) => maybeSetNull(value)),
        ];

        artifact.value.data = [...data, newRow];

        return newData;
      });
    }, updateInterval);

    return () => clearInterval(intervalId);
  }, [originalData, updateInterval, nullProbability]);

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

  // Add state to track dataset visibility
  const [datasetHidden, setDatasetHidden] = useState({});

  // Effect for chart lifecycle (creation and destruction)
  useEffect(() => {
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
        spanGaps: true, // Enable spanning gaps for null values globally
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
        plugins: {
          legend: {
            onClick: (evt, legendItem, legend) => {
              setDatasetHidden((prev) => ({
                ...prev,
                [legendItem.text]: !prev[legendItem.text],
              }));

              Chart.defaults.plugins.legend.onClick(evt, legendItem, legend);
            },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [secondYAxisColumns]);

  // Effect for data updates and data-dependent configuration
  useDeepCompareEffect(() => {
    if (
      !simulatedData ||
      Object.keys(simulatedData).length === 0 ||
      !chartRef.current
    )
      return;

    const artifactData = Object.values(simulatedData)[0].value;
    const xColumnIndex = artifactData.headers.indexOf(xAxisColumn);

    // Update data
    const labels = [];
    const datasets = [];

    // Initialize empty arrays for each dataset's data
    for (let i = 0; i < artifactData.headers.length; i++) {
      if (i === xColumnIndex) continue;
      datasets.push({
        label: artifactData.headers[i],
        data: [],
        yAxisID: secondYAxisColumns.includes(artifactData.headers[i])
          ? "y2"
          : "y1",
        hidden: datasetHidden[artifactData.headers[i]],
      });
    }

    // Fill in the data arrays, keeping null values as they are
    for (const row of artifactData.data) {
      labels.push(row[xColumnIndex]);
      let datasetIndex = 0;
      for (let i = 0; i < row.length; i++) {
        if (i === xColumnIndex) continue;
        datasets[datasetIndex].data.push(row[i]);
        datasetIndex++;
      }
    }

    const newData = { labels, datasets };

    // Update chart with new data and options
    chartRef.current.data = newData;
    chartRef.current.update();
    chartRef.current.resize(size.width, size.height - 50);
  }, [simulatedData, xAxisColumn, secondYAxisColumns, size, datasetHidden]);

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
