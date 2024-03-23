import _ from "lodash";
import {
  jsonSettings,
  otherConfigurableSettings,
  useSettings,
} from "models/settings";

const settingNames = Object.keys({
  ...jsonSettings,
  ...otherConfigurableSettings,
});

export function SimpleSettings() {
  const settings = useSettings(
    (x) =>
      _.map(_.pick(x, settingNames), (v, k) => ({
        name: k,
        value: processStoredValue(v),
      })),
    _.isEqual,
  );

  const handleInputChange = (index, newValue) => {
    const { name } = settings[index];
    useSettings.setState({ [name]: processEnteredValue(name, newValue) });
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

function processEnteredValue(name, value) {
  if (name === "snapGrid") {
    return value.split(",");
  } else if (name in jsonSettings) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value; // Or any other appropriate error handling or default value
    }
  }
  return value;
}

function processStoredValue(value) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}
