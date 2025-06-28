import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuthenticatedFetch } from "../../hooks/useAuthenticatedFetch";
import Notifications from "./Notifications";
import { generateNotificationId } from "./notificationUtils";
import NewProjectForm from "./NewProjectForm";
import ProjectCard from "./ProjectCard";
import LoadingProjects from "./LoadingProjects";

export default function ProjectsList() {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const authenticatedFetch = useAuthenticatedFetch();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [togglingStates, setTogglingStates] = useState(new Set());
  const [deploymentProgress, setDeploymentProgress] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [fetchError, setFetchError] = useState(null);

  // Track recent notification messages to prevent duplicates
  const recentNotifications = useRef(new Map());
  const fetchAttempts = useRef(0);

  const { isConnected, subscribe, EventType } = useWebSocket();

  // Warm up the backend on mount
  useEffect(() => {
    // Fire and forget health check to wake up Railway
    fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/health`)
      .then(() => console.log("Backend warmed up"))
      .catch(() =>
        console.log("Backend warm-up failed (will retry with auth)"),
      );
  }, []);

  // Improved notification system with deduplication
  const showNotification = useCallback((type, message) => {
    // Check if we've shown this exact message recently (within 2 seconds)
    const now = Date.now();
    const lastShown = recentNotifications.current.get(message);

    if (lastShown && now - lastShown < 2000) {
      return; // Skip duplicate notification
    }

    recentNotifications.current.set(message, now);

    // Clean up old entries
    for (const [msg, time] of recentNotifications.current.entries()) {
      if (now - time > 5000) {
        recentNotifications.current.delete(msg);
      }
    }

    const id = generateNotificationId();
    setNotifications((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Improved fetch with retry logic
  const fetchProjects = useCallback(async () => {
    try {
      setFetchError(null);
      const response = await authenticatedFetch("/api/projects");

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }

      const data = await response.json();
      setProjects(data);
      fetchAttempts.current = 0; // Reset attempts on success
      return true;
    } catch (error) {
      console.error("Error fetching projects:", error);
      setFetchError(error.message);

      // Only show notification after initial attempts or if it's been a while
      if (fetchAttempts.current > 1) {
        showNotification("error", "Failed to fetch projects. Retrying...");
      }

      fetchAttempts.current++;
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, showNotification]);

  // Initial fetch with retry
  useEffect(() => {
    let mounted = true;
    let retryTimeout;
    let initTimeout;

    const fetchWithRetry = async () => {
      if (!mounted) return;

      const success = await fetchProjects();

      // Retry after 3 seconds if failed (max 3 attempts)
      if (!success && fetchAttempts.current < 3 && mounted) {
        retryTimeout = setTimeout(fetchWithRetry, 3000);
      }
    };

    // Small delay to ensure auth is fully ready
    initTimeout = setTimeout(() => {
      if (mounted) {
        fetchWithRetry();
      }
    }, 500);

    return () => {
      mounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (initTimeout) clearTimeout(initTimeout);
    };
  }, [fetchProjects]);

  // WebSocket subscriptions with better error handling
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
          // Update machine data if provided
          ...(projectData.machine_id && { machine_id: projectData.machine_id }),
          ...(projectData.machine_state && {
            machine_state: projectData.machine_state,
          }),
        };
        return updated;
      });
    };

    const updateMachineState = (machineData) => {
      setProjects((prev) => {
        const index = prev.findIndex((p) => p.id === machineData.project_id);
        if (index === -1) return prev;

        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          machine_state: machineData.new_state,
        };
        return updated;
      });

      // Remove from toggling states
      setTogglingStates((prev) => {
        const newSet = new Set(prev);
        newSet.delete(machineData.project_id);
        return newSet;
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
        // PROJECT_READY now includes full project data with machine info
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
        setSelectedProjects((prev) => {
          const newSet = new Set(prev);
          newSet.delete(event.data.project_id);
          return newSet;
        });
        showNotification("info", `Project deleted: ${event.data.project_name}`);
      }),
      subscribe(EventType.PROJECT_STATUS_CHANGED, (event) => {
        updateProjectInList(event.data);
      }),
      subscribe(EventType.MACHINE_STATE_CHANGED, (event) => {
        updateMachineState(event.data);
        const stateText =
          event.data.new_state === "stopped" ? "hibernated" : "resumed";
        showNotification("info", `${event.data.project_name} ${stateText}`);
      }),
      subscribe(EventType.DEPLOYMENT_PROGRESS, (event) => {
        setDeploymentProgress((prev) => ({
          ...prev,
          [event.data.project_id]: event.data.progress,
        }));
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [isConnected, subscribe, EventType, showNotification]);

  const handleCreateProject = async (projectName, githubUrl) => {
    try {
      const payload = { name: projectName };
      if (githubUrl && githubUrl.trim()) {
        payload.github_url = githubUrl.trim();
      }

      const response = await authenticatedFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create project");
      }

      const newProject = await response.json();
      setProjects([...projects, newProject]);
      setShowNewProjectForm(false);
    } catch (error) {
      showNotification("error", `Failed to create project: ${error.message}`);
      throw error; // Re-throw to let form handle it
    }
  };

  const handleToggleSelect = (projectId) => {
    setSelectedProjects((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    }
  };

  const handleDeleteSelected = async () => {
    const count = selectedProjects.size;
    if (!count) return;

    if (
      !confirm(
        `Are you sure you want to delete ${count} project${count > 1 ? "s" : ""}?`,
      )
    ) {
      return;
    }

    const projectsToDelete = Array.from(selectedProjects);
    let deletedCount = 0;
    let failedCount = 0;

    for (const projectId of projectsToDelete) {
      try {
        const response = await authenticatedFetch(
          `/api/projects/${projectId}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) throw new Error("Failed to delete project");
        deletedCount++;
      } catch (error) {
        console.error("Error deleting project:", error);
        failedCount++;
      }
    }

    if (failedCount > 0) {
      showNotification("error", `Failed to delete ${failedCount} project(s)`);
    }
    if (deletedCount > 0) {
      showNotification("success", `Deleted ${deletedCount} project(s)`);
    }

    setSelectedProjects(new Set());
  };

  const handleToggleMachineState = async (projectId, action) => {
    setTogglingStates((prev) => new Set(prev).add(projectId));

    try {
      const response = await authenticatedFetch(
        `/api/projects/${projectId}/machine/${action}`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `Failed to ${action} machine`);
      }

      showNotification("info", `Machine ${action} requested`);
    } catch (error) {
      console.error(`Error ${action} machine:`, error);
      showNotification("error", error.message);
      setTogglingStates((prev) => {
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
      <LoadingProjects
        error={fetchError}
        onRetry={() => {
          setLoading(true);
          setFetchError(null);
          fetchProjects();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Notifications
        notifications={notifications}
        onRemove={removeNotification}
      />

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
          {selectedProjects.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center rounded-full bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-600"
            >
              <TrashIcon className="mr-1 h-3 w-3" />
              Delete ({selectedProjects.size})
            </button>
          )}
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
            {fetchError ? (
              <div>
                <p>Unable to load projects.</p>
                <button
                  onClick={() => {
                    setLoading(true);
                    setFetchError(null);
                    fetchProjects();
                  }}
                  className="mt-4 px-4 py-2 bg-setta-600 text-white rounded hover:bg-setta-500"
                >
                  Try Again
                </button>
              </div>
            ) : (
              "No projects yet. Create your first project!"
            )}
          </div>
        ) : (
          <>
            <div className="border-b border-setta-200 px-6 py-3 dark:border-setta-700">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    selectedProjects.size === projects.length &&
                    projects.length > 0
                  }
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-setta-300 text-setta-600 focus:ring-setta-500 dark:border-setta-600 dark:bg-setta-800"
                />
                Select all
              </label>
            </div>
            <ul className="divide-y divide-setta-200/50 dark:divide-setta-700/50">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  progress={deploymentProgress[project.id]}
                  isSelected={selectedProjects.has(project.id)}
                  onToggleSelect={handleToggleSelect}
                  onToggleMachineState={handleToggleMachineState}
                  isTogglingState={togglingStates.has(project.id)}
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
