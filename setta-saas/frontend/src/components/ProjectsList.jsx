import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PlusIcon,
  TrashIcon,
  ReloadIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";

// Use environment variable in production, fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [deletingProjects, setDeletingProjects] = useState(new Set());

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

  const handleDeleteProject = async (projectId) => {
    if (!confirm("Are you sure you want to delete this project?")) {
      return;
    }

    // Add to deleting set
    setDeletingProjects((prev) => new Set(prev).add(projectId));

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete project");

      // Remove from projects list
      setProjects(projects.filter((p) => p.id !== projectId));
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project. Please try again.");
    } finally {
      // Remove from deleting set
      setDeletingProjects((prev) => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchProjects();
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
      case "deployment_pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "error":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "hibernating":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between pb-6">
        <h1 className="text-3xl font-heading font-bold text-setta-800 dark:text-setta-100">
          Projects
        </h1>
        <div className="flex space-x-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center rounded-full bg-setta-500 px-4 py-2 text-xs font-medium text-white hover:bg-setta-400 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-setta-600 dark:hover:bg-setta-500"
          >
            <ReloadIcon
              className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
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
                className="px-6 py-4 hover:bg-setta-50 dark:hover:bg-setta-850 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => {
                      if (
                        project.url &&
                        project.url !== "Creating..." &&
                        project.url !== "Failed to create"
                      ) {
                        window.open(project.url, "_blank");
                      }
                    }}
                  >
                    <p className="font-medium text-setta-800 dark:text-setta-100">
                      {project.name}
                    </p>
                    <p className="text-xs text-setta-500 dark:text-setta-400 hover:text-setta-600 dark:hover:text-setta-300 flex items-center gap-1">
                      {project.url}
                      {project.url &&
                        project.url !== "Creating..." &&
                        project.url !== "Failed to create" && (
                          <ExternalLinkIcon className="h-3 w-3" />
                        )}
                    </p>
                    <p className="text-xs text-setta-400 dark:text-setta-500 mt-1">
                      Created: {new Date(project.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(project.status)}`}
                    >
                      {project.status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      disabled={deletingProjects.has(project.id)}
                      className="inline-flex items-center rounded-full p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete project"
                    >
                      <TrashIcon
                        className={`h-4 w-4 ${deletingProjects.has(project.id) ? "animate-pulse" : ""}`}
                      />
                    </button>
                  </div>
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
