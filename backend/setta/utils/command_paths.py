def is_path_like_command(command: str) -> bool:
    return "/" in command or "\\" in command or command.startswith(".")
