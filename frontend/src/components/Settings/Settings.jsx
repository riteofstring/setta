import { useState } from "react";

export function Settings() {
  const initialSettings = [
    { name: "Setting1", value: "" },
    { name: "Setting2", value: "" },
    // Add more settings as needed
  ];

  const [settings, setSettings] = useState(initialSettings);

  const handleInputChange = (index, newValue) => {
    const newSettings = settings.map((setting, i) => {
      if (i === index) {
        return { ...setting, value: newValue };
      }
      return setting;
    });
    setSettings(newSettings);
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
