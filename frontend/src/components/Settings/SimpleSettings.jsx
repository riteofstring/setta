import _ from "lodash";
import { useSettings } from "models/settings";

const settingNames = ["snapGrid"];

export function SimpleSettings() {
  const settings = useSettings(
    (x) => _.map(_.pick(x, settingNames), (v, k) => ({ name: k, value: v })),
    _.isEqual,
  );

  const handleInputChange = (index, newValue) => {
    const { name } = settings[index];
    useSettings.setState({ [name]: processValue(name, newValue) });
  };

  return (
    <div className="mt-10 flex justify-center">
      <div>
        {settings.map((setting, index) => (
          <div key={index} className="mb-4 flex items-center">
            <label className="mr-2 text-white">{setting.name}</label>
            <input
              type="text"
              value={setting.value}
              onChange={(e) => handleInputChange(index, e.target.value)}
              className="rounded bg-gray-800 p-2 text-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function processValue(name, value) {
  if (name === "snapGrid") {
    return value.split(",");
  }
}
