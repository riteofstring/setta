import os


def handle_str_replace_editor_tool_view(path, view_range=None):
    """
    Read a file or list directory contents based on the provided path.

    Args:
        path (str): Path to a file or directory
        view_range (list, optional): List of two integers [start_line, end_line]
                                    specifying the line range to view (1-indexed).
                                    If end_line is -1, read to the end of the file.
                                    This parameter is only used for files, not directories.

    Returns:
        If path is a directory: List of directory contents (filenames and directory names)
        If path is a file: Content of the file, optionally limited to the specified line range

    Raises:
        FileNotFoundError: If the path doesn't exist
        ValueError: If the view_range is invalid
    """
    # Check if path exists
    if not os.path.exists(path):
        raise FileNotFoundError(f"Path does not exist: {path}")

    # If it's a directory
    if os.path.isdir(path):
        return os.listdir(path)

    # If it's a file
    elif os.path.isfile(path):
        # Read the entire file
        with open(path, "r") as file:
            lines = file.readlines()

        # If view_range is specified, return only those lines
        if view_range is not None:
            # Validate view_range
            if not isinstance(view_range, list) or len(view_range) != 2:
                raise ValueError("view_range must be a list of two integers")

            start_line, end_line = view_range

            # Validate start_line and end_line
            if not isinstance(start_line, int) or start_line < 1:
                raise ValueError("start_line must be a positive integer")

            if not isinstance(end_line, int) or (end_line < 1 and end_line != -1):
                raise ValueError("end_line must be a positive integer or -1")

            # Convert to 0-indexed
            start_idx = start_line - 1

            # Handle end_line = -1 (read to the end)
            if end_line == -1:
                end_idx = len(lines)
            else:
                end_idx = end_line  # Python slices exclude the end index

            # Ensure indices are within bounds
            start_idx = max(0, min(start_idx, len(lines)))
            end_idx = max(start_idx, min(end_idx, len(lines)))

            # Return the specified lines
            return "".join(lines[start_idx:end_idx])

        # Return the entire file
        return "".join(lines)

    # If it's neither a file nor a directory (e.g., a symlink)
    else:
        raise ValueError(f"Path is neither a file nor a directory: {path}")
