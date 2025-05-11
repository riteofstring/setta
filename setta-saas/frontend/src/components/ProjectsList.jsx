import { useNavigate } from "react-router-dom";
import { PlusIcon } from "@radix-ui/react-icons";

export default function ProjectsList() {
  const navigate = useNavigate();

  // Dummy project data - in a real app, you would fetch this from your API
  const projects = [
    { id: 1, name: "ollama test", status: "In Progress" },
    { id: 2, name: "Agentic Multi-Prompter", status: "Planning" },
    { id: 3, name: "Flux image gen", status: "Completed" },
    { id: 4, name: "Website Automation Agent", status: "In Progress" },
    { id: 5, name: "Pytorch Metric Learning", status: "Planning" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    navigate("/login");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between pb-6">
        <h1 className="text-3xl font-heading font-bold text-setta-800 dark:text-setta-100">
          Projects
        </h1>
        <div className="flex space-x-2">
          <button className="inline-flex items-center rounded-full bg-setta-600 px-4 py-2 text-xs font-medium text-white hover:bg-setta-500 dark:bg-setta-700 dark:hover:bg-setta-600">
            <PlusIcon className="mr-1 h-3 w-3" />
            New Project
          </button>
          <button
            onClick={handleLogout}
            className="rounded-full bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-setta-875">
        <ul className="divide-y divide-setta-200/50 dark:divide-setta-700/50">
          {projects.map((project) => (
            <li
              key={project.id}
              className="px-6 py-4 cursor-pointer hover:bg-setta-50 dark:hover:bg-setta-850"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-setta-800 dark:text-setta-100">
                    {project.name}
                  </p>
                  <p className="text-xs text-setta-500 dark:text-setta-400">
                    Project ID: {project.id}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    project.status === "Completed"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                      : project.status === "In Progress"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                  }`}
                >
                  {project.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-setta-200 px-6 py-4 dark:border-setta-700">
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Showing {projects.length} projects
          </p>
        </div>
      </div>
    </div>
  );
}
