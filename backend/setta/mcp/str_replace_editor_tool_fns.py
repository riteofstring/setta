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

            # Return the specified lines with line numbers
            return "".join(
                [f"{i + 1}: {lines[start_idx + i]}" for i in range(end_idx - start_idx)]
            )

        # Return the entire file with line numbers
        return "".join([f"{i + 1}: {line}" for i, line in enumerate(lines)])

    # If it's neither a file nor a directory (e.g., a symlink)
    else:
        raise ValueError(f"Path is neither a file nor a directory: {path}")


def handle_str_replace_editor_tool_str_replace(path, old_str, new_str):
    """
    Replace a single occurrence of old_str with new_str in the file at path.

    Args:
        path (str): The path to the file to modify
        old_str (str): The text to replace (must match exactly, including whitespace and indentation)
        new_str (str): The new text to insert in place of the old text

    Raises:
        ValueError: If old_str is not found exactly once in the file

    Returns:
        str
    """
    # Read the file content
    with open(path, "r") as file:
        content = file.read()

    # Count replacements
    count = content.count(old_str)

    # Ensure there is exactly one match
    if count == 0:
        raise ValueError(f"Error: String not found in {path}")
    elif count > 1:
        raise ValueError(
            f"Error: Found {count} occurrences of the string in {path}, expected exactly 1"
        )

    # Replace old_str with new_str
    modified_content = content.replace(
        old_str, new_str, 1
    )  # Only replace the first occurrence

    # Write the modified content back to the file
    with open(path, "w") as file:
        file.write(modified_content)

    return "Successfully replaced text at exactly one location."


def handle_str_replace_editor_tool_create(path, file_text):
    """
    Creates a new file at the specified path and writes the given text to it.

    Args:
        path (str): The path where the new file should be created
        file_text (str): The content to write to the new file

    Returns:
        str: A success message

    Raises:
        TypeError: If path or file_text is not a string
        ValueError: If path is empty
        FileNotFoundError: If the directory path doesn't exist
        PermissionError: If there are insufficient permissions to create the file
        FileExistsError: If the file already exists
        IsADirectoryError: If the path points to a directory instead of a file
        IOError: For other I/O related errors
    """
    # Check if path is a valid string
    if not isinstance(path, str):
        raise TypeError("Path must be a string")
    if not path:
        raise ValueError("Path cannot be empty")

    # Check if file_text is a string
    if not isinstance(file_text, str):
        raise TypeError("File text must be a string")

    try:
        with open(path, "x") as file:
            file.write(file_text)
        return f"Successfully created file at {path}"
    except FileExistsError:
        raise FileExistsError(f"A file already exists at {path}")
    except FileNotFoundError:
        raise FileNotFoundError(f"The directory specified in {path} does not exist")
    except PermissionError:
        raise PermissionError(f"Insufficient permissions to create file at {path}")
    except IsADirectoryError:
        raise IsADirectoryError(f"The path {path} points to a directory, not a file")
    except IOError as e:
        raise IOError(f"An I/O error occurred: {str(e)}")
