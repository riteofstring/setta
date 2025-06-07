import { InfoCircledIcon } from "@radix-ui/react-icons";

export default function Notifications({ notifications }) {
  if (!notifications.length) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 shadow-lg transition-all ${
            notification.type === "error"
              ? "bg-red-500 text-white"
              : notification.type === "success"
                ? "bg-green-500 text-white"
                : "bg-blue-500 text-white"
          }`}
        >
          <InfoCircledIcon className="h-4 w-4" />
          <span className="text-sm">{notification.message}</span>
        </div>
      ))}
    </div>
  );
}
