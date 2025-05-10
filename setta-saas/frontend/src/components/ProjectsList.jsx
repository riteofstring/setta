import { useNavigate } from "react-router-dom";

export default function ProjectsList() {
  const navigate = useNavigate();

  // Dummy project data - in a real app, you would fetch this from your API
  const projects = [
    { id: 1, name: "Website Redesign", status: "In Progress" },
    { id: 2, name: "Mobile App", status: "Planning" },
    { id: 3, name: "E-commerce Platform", status: "Completed" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-7xl justify-between px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <button
            onClick={handleLogout}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <ul className="divide-y divide-gray-200">
                {projects.map((project) => (
                  <li key={project.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {project.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          ID: {project.id}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          project.status === "Completed"
                            ? "bg-green-100 text-green-800"
                            : project.status === "In Progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {project.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-200 px-6 py-4">
                <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  Add New Project
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
