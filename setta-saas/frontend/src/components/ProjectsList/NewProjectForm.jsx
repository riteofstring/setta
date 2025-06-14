import { useState } from "react";

export default function NewProjectForm({ onSubmit, onCancel }) {
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectName.trim() || creating) return;

    setCreating(true);
    try {
      await onSubmit(projectName);
      setProjectName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mb-6 p-4 rounded-lg bg-white shadow dark:bg-setta-875 border border-setta-200 dark:border-setta-700">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Enter project name"
          className="flex-1 rounded-md border border-setta-300 px-3 py-2 text-sm dark:bg-setta-900 dark:border-setta-700 dark:text-setta-100"
          autoFocus
          disabled={creating}
        />
        <button
          type="submit"
          disabled={creating || !projectName.trim()}
          className="rounded-md bg-setta-600 px-4 py-2 text-sm text-white hover:bg-setta-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          className="rounded-md bg-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-400 dark:bg-setta-700 dark:text-setta-200 dark:hover:bg-setta-600"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
