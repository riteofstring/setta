import { FiEdit3 } from "react-icons/fi";
import { HiCode } from "react-icons/hi";
import { TbUser } from "react-icons/tb";
import { getCurrentProjectConfig } from "state/actions/project/loadProject";
import { useProjectState } from "state/definitions";
import { VIEWING_EDITING_MODE } from "utils/constants";

export function ViewingEditingMode() {
  const selectedMode = useProjectState(
    (x) => getCurrentProjectConfig(x).viewingEditingMode,
  );

  const modes = [
    {
      id: VIEWING_EDITING_MODE.DEV,
      label: "Developer View",
      icon: <HiCode size={20} />,
    },
    {
      id: VIEWING_EDITING_MODE.USER,
      label: "User View",
      icon: <TbUser size={20} />,
    },
    {
      id: VIEWING_EDITING_MODE.USER_EDIT,
      label: "Edit User View",
      icon: <FiEdit3 size={20} />,
    },
  ];

  const handleModeChange = (modeId) => {
    useProjectState.setState((state) => {
      getCurrentProjectConfig(state).viewingEditingMode = modeId;
    });
  };

  return (
    <div className="flex w-full flex-col gap-2">
      {modes.map((mode) => (
        <button
          key={mode.id}
          className={`flex flex-1 items-center gap-2 rounded p-2 transition-all ${selectedMode === mode.id ? "bg-white text-blue-600 shadow-sm dark:bg-setta-800" : "text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/50"} cursor-pointer text-xs`}
          onClick={() => handleModeChange(mode.id)}
          title={mode.label}
        >
          <span
            className={`flex items-center justify-center ${selectedMode === mode.id ? "text-blue-600 dark:text-blue-400" : "text-setta-500 dark:text-setta-400"}`}
          >
            {mode.icon}
          </span>

          {mode.label}
        </button>
      ))}
    </div>
  );
}
