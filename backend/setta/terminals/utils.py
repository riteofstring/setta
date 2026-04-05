import re
import subprocess

import psutil


def windows_has_child_processes(input_winpid):
    if len(psutil.Process(input_winpid).children()) > 0:
        return True

    # when running in bash.exe, sometimes the bash process children
    # are not visible when querying using the windows pid
    # so this finds the corresponding bash pid for the input winpid
    # and finds its children
    output = subprocess.check_output("ps", shell=True).decode()
    processes = []
    bash_pid = None
    pid_idx, ppid_idx, winpid_idx = None, None, None
    for i, line in enumerate(output.split("\n")):  # Skip the header line
        columns = re.split(r"\s+", line)
        if i == 0:
            pid_idx = columns.index("PID")
            ppid_idx = columns.index("PPID")
            winpid_idx = columns.index("WINPID")
        elif (
            columns != [""]
            and pid_idx is not None
            and ppid_idx is not None
            and winpid_idx is not None
        ):
            pid = int(columns[pid_idx])
            ppid = int(columns[ppid_idx])
            winpid = int(columns[winpid_idx])
            processes.append({"pid": pid, "ppid": ppid, "winpid": winpid})
            if winpid == input_winpid:
                bash_pid = pid

    return len([p for p in processes if p["ppid"] == bash_pid]) > 0


def linux_has_child_processes(pid):
    try:
        return len(psutil.Process(pid).children()) > 0
    except psutil.NoSuchProcess:
        return False


def linux_get_child_process_details(pid):
    try:
        child_processes = psutil.Process(pid).children()
        children_details = []

        for child in child_processes:
            try:
                children_details.append(
                    {
                        "pid": child.pid,
                        "name": child.name(),
                        "cmdline": child.cmdline(),
                        "status": child.status(),
                        "create_time": child.create_time(),
                    }
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                # Handle cases where process might have terminated or we don't have permission
                pass

        return children_details
    except psutil.NoSuchProcess:
        # Handle case where the parent process no longer exists
        return []
