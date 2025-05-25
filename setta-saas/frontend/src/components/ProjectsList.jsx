import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";

// Use environment variable or default to local dev
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects`);
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
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newProjectName }),
      });

      if (response.ok) {
        // Refresh projects list
        await fetchProjects();
        setNewProjectName("");
        setShowNewProjectForm(false);
      }
    } catch (error) {
      console.error("Error creating project:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Refresh projects list
        await fetchProjects();
      }
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    navigate("/login");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "running":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "creating":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "created":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "error":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-setta-500 dark:text-setta-400">
          Loading projects...
        </div>
      </div>
    );
  }

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

      {/* New Project Form */}
      {showNewProjectForm && (
        <div className="mb-6 rounded-lg bg-white p-4 shadow dark:bg-setta-875">
          <form onSubmit={handleCreateProject} className="flex gap-2">
            <input
              type="text"
              placeholder="Project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="flex-1 rounded-full px-4 py-2 text-sm border border-setta-200 dark:border-setta-700 bg-white dark:bg-setta-900 text-setta-800 dark:text-setta-100"
              disabled={creating}
              autoFocus
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-setta-600 px-4 py-2 text-xs font-medium text-white hover:bg-setta-500 disabled:opacity-50 dark:bg-setta-700 dark:hover:bg-setta-600"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewProjectForm(false);
                setNewProjectName("");
              }}
              className="rounded-full bg-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-400 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-setta-875">
        <ul className="divide-y divide-setta-200/50 dark:divide-setta-700/50">
          {projects.map((project) => (
            <li
              key={project.id}
              className="px-6 py-4 hover:bg-setta-50 dark:hover:bg-setta-850"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-setta-800 dark:text-setta-100">
                    {project.name}
                  </p>
                  <p className="text-xs text-setta-500 dark:text-setta-400">
                    {project.url}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
                      project.status,
                    )}`}
                  >
                    {project.status}
                  </span>
                  <button
                    onClick={() => handleDeleteProject(project.id)}
                    className="rounded-full p-1 hover:bg-red-100 dark:hover:bg-red-900"
                    title="Delete project"
                  >
                    <TrashIcon className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-setta-200 px-6 py-4 dark:border-setta-700">
          <p className="text-xs text-setta-500 dark:text-setta-400">
            {projects.length === 0
              ? "No projects yet. Create your first project!"
              : `Showing ${projects.length} projects`}
          </p>
        </div>
      </div>
    </div>
  );
}
