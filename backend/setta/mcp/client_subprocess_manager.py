import subprocess
import sys
from pathlib import Path

from setta.utils.utils import get_absolute_path


class MCPSubprocessManager:
    def __init__(self, mcp_server_url, websocket_url):
        self.script_path = get_absolute_path(__file__, Path("client_subprocess.py"))
        self.mcp_server_url = mcp_server_url
        self.websocket_url = websocket_url
        self.process = None

    def start(self):
        if self.is_running():
            print("MCPClient subprocess is already running")
            return

        cmd = [
            sys.executable,
            str(self.script_path),
            "--mcp-server-url",
            self.mcp_server_url,
            "--websocket-url",
            self.websocket_url,
        ]

        print(f"Starting MCPClient subprocess: {' '.join(cmd)}")

        # Use subprocess.PIPE to capture output
        # Use subprocess.DEVNULL to discard output (simpler approach)
        # Use existing file descriptors like sys.stdout for logging to the same stream
        # Choose the approach that works best for your needs

        self.process = subprocess.Popen(
            cmd,
            stdout=sys.stdout,  # Route subprocess stdout to parent process stdout
            stderr=sys.stderr,  # Route subprocess stderr to parent process stderr
            # Alternatively, use PIPE and process logs separately, or DEVNULL to discard
        )

        print(f"Started MCPClient subprocess with PID {self.process.pid}")

    def stop(self):
        """Stop the MCPClient subprocess"""
        if not self.is_running():
            print("MCPClient subprocess is not running")
            return

        print(f"Stopping MCPClient subprocess (PID: {self.process.pid})")

        # First try terminating gracefully with SIGTERM
        self.process.terminate()

        try:
            # Wait up to 5 seconds for process to terminate
            self.process.wait(timeout=5)
            print("MCPClient subprocess terminated gracefully")
        except subprocess.TimeoutExpired:
            # If still running after timeout, force kill
            print("MCPClient subprocess did not terminate gracefully, killing...")
            self.process.kill()
            self.process.wait()  # No timeout needed for kill
            print("MCPClient subprocess killed")

        self.process = None

    def is_running(self) -> bool:
        """Check if the subprocess is still running"""
        if self.process is None:
            return False

        # poll() returns None if the process is still running
        # Otherwise, it returns the exit code
        return self.process.poll() is None
