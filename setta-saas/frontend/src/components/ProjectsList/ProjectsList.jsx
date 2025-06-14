import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import { PlusIcon } from "@radix-ui/react-icons";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuthenticatedFetch } from "../../hooks/useAuthenticatedFetch";
import Notifications from "./Notifications";
import NewProjectForm from "./NewProjectForm";
import ProjectCard from "./ProjectCard";

export default function ProjectsList() {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const authenticatedFetch = useAuthenticatedFetch();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [deletingProjects, setDeletingProjects] = useState(new Set());
  const [deploymentProgress, setDeploymentProgress] = useState({});
  const [notifications, setNotifications] = useState([]);

  const { isConnected, subscribe, EventType } = useWebSocket();

  const showNotification = (type, message) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  // Initial fetch
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await authenticatedFetch("/api/projects");
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        setProjects(data);
      } catch (error) {
        console.error("Error fetching projects:", error);
        showNotification("error", "Failed to fetch projects");
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [authenticatedFetch]);

  // WebSocket subscriptions
  useEffect(() => {
    if (!isConnected) return;

    const updateProjectInList = (projectData) => {
      setProjects((prev) => {
        const index = prev.findIndex((p) => p.id === projectData.project_id);
        if (index === -1) return prev;

        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          status: projectData.status,
          url: projectData.url || updated[index].url,
        };
        return updated;
      });
    };

    const unsubscribers = [
      subscribe(EventType.PROJECT_CREATING, (event) => {
        updateProjectInList(event.data);
        showNotification(
          "info",
          `Creating project: ${event.data.project_name}`,
        );
      }),
      subscribe(EventType.PROJECT_READY, (event) => {
        updateProjectInList(event.data);
        setDeploymentProgress((prev) => {
          const updated = { ...prev };
          delete updated[event.data.project_id];
          return updated;
        });
        showNotification(
          "success",
          `Project ready: ${event.data.project_name}`,
        );
      }),
      subscribe(EventType.PROJECT_ERROR, (event) => {
        updateProjectInList(event.data);
        setDeploymentProgress((prev) => {
          const updated = { ...prev };
          delete updated[event.data.project_id];
          return updated;
        });
        showNotification(
          "error",
          `Failed to create: ${event.data.project_name}`,
        );
      }),
      subscribe(EventType.PROJECT_DELETED, (event) => {
        setProjects((prev) =>
          prev.filter((p) => p.id !== event.data.project_id),
        );
        showNotification("info", `Project deleted: ${event.data.project_name}`);
      }),
      subscribe(EventType.PROJECT_STATUS_CHANGED, (event) => {
        updateProjectInList(event.data);
      }),
      subscribe(EventType.DEPLOYMENT_PROGRESS, (event) => {
        setDeploymentProgress((prev) => ({
          ...prev,
          [event.data.project_id]: event.data.progress,
        }));
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [isConnected, subscribe, EventType]);

  const handleCreateProject = async (projectName) => {
    const response = await authenticatedFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: projectName }),
    });

    if (!response.ok) throw new Error("Failed to create project");

    const newProject = await response.json();
    setProjects([...projects, newProject]);
    setShowNewProjectForm(false);
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm("Are you sure you want to delete this project?")) return;

    setDeletingProjects((prev) => new Set(prev).add(projectId));

    try {
      const response = await authenticatedFetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete project");
    } catch (error) {
      console.error("Error deleting project:", error);
      showNotification("error", "Failed to delete project");
    } finally {
      setDeletingProjects((prev) => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    }
  };

  const handleLogout = () => {
    signOut(() => navigate("/sign-in"));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="p-6 text-center text-setta-600 dark:text-setta-400">
          Loading projects...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Notifications notifications={notifications} />

      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-setta-800 dark:text-setta-100">
            Projects
          </h1>
          <p
            className={`text-xs mt-1 ${
              isConnected
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            ●{" "}
            {isConnected
              ? "Real-time updates active"
              : "Connection lost - trying to reconnect..."}
          </p>
        </div>
        <div className="flex gap-2">
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
        <NewProjectForm
          onSubmit={handleCreateProject}
          onCancel={() => setShowNewProjectForm(false)}
        />
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-setta-875">
        {projects.length === 0 ? (
          <div className="p-6 text-center text-setta-500 dark:text-setta-400">
            No projects yet. Create your first project!
          </div>
        ) : (
          <>
            <ul className="divide-y divide-setta-200/50 dark:divide-setta-700/50">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  progress={deploymentProgress[project.id]}
                  onDelete={handleDeleteProject}
                  isDeleting={deletingProjects.has(project.id)}
                />
              ))}
            </ul>
            <div className="border-t border-setta-200 px-6 py-4 dark:border-setta-700">
              <p className="text-xs text-setta-500 dark:text-setta-400">
                Showing {projects.length} projects
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
