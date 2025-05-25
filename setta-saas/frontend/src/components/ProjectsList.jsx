import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon } from "@radix-ui/react-icons";

// Use environment variable in production, fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newProjectName }),
      });

      if (!response.ok) throw new Error("Failed to create project");

      const newProject = await response.json();
      setProjects([...projects, newProject]);
      setNewProjectName("");
      setShowNewProjectForm(false);
    } catch (error) {
      console.error("Error creating project:", error);
      alert("Failed to create project. Please try again.");
    } finally {
      setCreating(false);
    }
  };

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
          <button
            onClick={() => setShowNewProjectForm(true)}
            className="inline-flex items-center rounded-full bg-setta-600 px-4 py-2 text-xs font-medium text-white hover:bg-setta-500 dark:bg-setta-700 dark:hover:bg-setta-600"
          >
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

      {showNewProjectForm && (
        <div className="mb-6 p-4 rounded-lg bg-white shadow dark:bg-setta-875 border border-setta-200 dark:border-setta-700">
          <form onSubmit={handleCreateProject} className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Enter project name"
              className="flex-1 rounded-md border border-setta-300 px-3 py-2 text-sm dark:bg-setta-900 dark:border-setta-700 dark:text-setta-100"
              autoFocus
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || !newProjectName.trim()}
              className="rounded-md bg-setta-600 px-4 py-2 text-sm text-white hover:bg-setta-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewProjectForm(false);
                setNewProjectName("");
              }}
              disabled={creating}
              className="rounded-md bg-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-400 dark:bg-setta-700 dark:text-setta-200 dark:hover:bg-setta-600"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-setta-875">
        {loading ? (
          <div className="p-6 text-center text-setta-600 dark:text-setta-400">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="p-6 text-center text-setta-500 dark:text-setta-400">
            No projects yet. Create your first project!
          </div>
        ) : (
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
                      {project.url}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      project.status === "running"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                        : project.status === "creating"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                    }`}
                  >
                    {project.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-setta-200 px-6 py-4 dark:border-setta-700">
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Showing {projects.length} projects
          </p>
        </div>
      </div>
    </div>
  );
}
