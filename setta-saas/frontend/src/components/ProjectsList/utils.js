// Status color mappings
export const getStatusColor = (status) => {
  const colors = {
    running:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    creating:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    deploying:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    hibernating:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  };

  return (
    colors[status] ||
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
  );
};

// Check if URL is clickable
export const isValidProjectUrl = (url) => {
  if (!url) return false;
  if (url === "Creating...") return false;
  if (url === "Failed to create") return false;
  return true;
};

// Format date
export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};
