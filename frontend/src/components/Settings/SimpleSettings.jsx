import _ from "lodash";
import { useSettings } from "state/definitions";
import { jsonSettings, otherConfigurableSettings } from "utils/constants";

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
    <>
      {settings.map((setting, index) => (
        <div
          key={index}
          className="-mx-3 flex items-center justify-between rounded-lg px-3 py-1 hover:bg-setta-200/25 dark:hover:bg-setta-800/50"
        >
          <label className="mr-2 break-all text-setta-700 dark:text-setta-100">
            {setting.name}
          </label>
          <input
            type="text"
            value={setting.value}
            onChange={(e) => handleInputChange(index, e.target.value)}
            className="rounded-xl bg-setta-200 px-2 py-1 dark:bg-setta-800  dark:text-setta-50"
          />
        </div>
      ))}
    </>
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
