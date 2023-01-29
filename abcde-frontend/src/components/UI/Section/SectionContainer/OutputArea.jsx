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
import { useGetSelectedOutputValues } from "hooks/useSectionContents";
import _ from "lodash";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export function OutputArea({ sectionId }) {
  const selectedGroups = useGetSelectedOutputValues(sectionId);

  return (
    <>
      {_.map(selectedGroups, (group) => (
        <LineChart
          outputs={group.children}
          title={group.name}
          key={`${sectionId}-${group.name}-chart`}
        />
      ))}
    </>
  );
}

function LineChart({ outputs, title }) {
  const datasets = outputs.map((x) => ({
    label: x.name,
    data: x.values,
    borderColor: "rgb(255, 99, 132)",
    backgroundColor: "rgba(255, 99, 132, 0.5)",
  }));

  const labels = datasets[0] ? _.range(datasets[0].data.length) : [];

  const data = {
    labels,
    datasets,
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: title,
      },
    },
  };

  return <Line options={options} data={data} />;
}
