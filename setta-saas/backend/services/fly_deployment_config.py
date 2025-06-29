"""
Fly.io deployment configuration.
Centralizes deployment settings to make it easy to switch between test and production modes.
"""

import os

# Deployment mode - set via environment variable
DEPLOYMENT_MODE = os.getenv("FLY_DEPLOYMENT_MODE", "test")  # "test" or "production"


def get_start_command() -> list[str]:
    """Get the start command based on deployment mode."""
    if DEPLOYMENT_MODE == "production":
        # In production, we just run setta
        return ["setta"]
    else:
        # In test mode, run the test app directly
        # This assumes the test repo has app.py with a FastAPI app
        return ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]


def get_buildpacks() -> list[str]:
    """Get the buildpacks to use."""
    # Python buildpack auto-detects and installs from requirements.txt
    return ["paketo-buildpacks/python"]


def get_machine_config(github_url: str) -> dict:
    """Get the complete machine configuration for GitHub deployments."""
    return {
        "build": {
            "image": github_url,  # Fly.io builds directly from GitHub
            "builder": "paketobuildpacks/builder-jammy-base",
            "buildpacks": get_buildpacks(),
        },
        "guest": {
            "cpu_kind": "shared",
            "cpus": 1,
            "memory_mb": 512,
        },
        "services": [
            {
                "ports": [
                    {"port": 80, "handlers": ["http"], "force_https": True},
                    {"port": 443, "handlers": ["http", "tls"]},
                ],
                "protocol": "tcp",
                "internal_port": 8080,
                "autostop": "stop",  # Hibernates when idle
                "autostart": True,  # Wakes on request
                "min_machines_running": 0,  # Scale to zero
            }
        ],
        "env": {
            "PORT": "8080",
            "PYTHONUNBUFFERED": "1",
        },
        "init": {"cmd": get_start_command()},
        "auto_destroy": False,
        "restart": {
            "policy": "on-failure",
            "max_retries": 1,
        },
        "stop": {
            "timeout": "5m",
            "signal": "SIGTERM",
        },
    }


def validate_github_url(url: str) -> bool:
    """Validate that the URL is a GitHub repository."""
    return url.startswith(("https://github.com/", "http://github.com/"))


# Future requirements when setta is ready:
# 1. User's requirements.txt must contain "setta"
# 2. No Procfile needed - we control the start command
# 3. Setta will handle finding and running their Python code
# 4. Setta will serve the UI on port 8080
