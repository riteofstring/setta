import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import _ from "lodash";
import { useOutputs } from "models/info/outputs";
import { Line } from "react-chartjs-2";
import { SECTIONWIDTH } from "utils/constants";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export const options = {
  responsive: true,
  plugins: {
    legend: {
      position: "top",
    },
    title: {
      display: true,
      text: "Chart.js Line Chart",
    },
  },
};

export function OutputSection() {
  // const groupName = "wave";
  // const rawData = useOutputs((x) => x.x[groupName]);
  // const datasetNames = rawData ? Object.keys(rawData) : [];
  // const datasets = datasetNames.map((x) => ({
  //   label: x,
  //   data: rawData[x],
  //   borderColor: "rgb(255, 99, 132)",
  //   backgroundColor: "rgba(255, 99, 132, 0.5)",
  // }));

  // const labels = datasets[0] ? _.range(datasets[0].data.length) : [];

  // const data = {
  //   labels,
  //   datasets,
  // };

  // return (
  //   <div
  //     style={{
  //       width: `${SECTIONWIDTH}px`,
  //     }}
  //   >
  //     <Line options={options} data={data} />
  //   </div>
  // );
  return null
}
