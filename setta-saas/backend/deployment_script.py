"""
Deployment scripts for Fly.io containers.
"""

GITHUB_DEPLOY_SCRIPT = """#!/bin/bash
set -e

echo "=== Starting GitHub deployment ==="
echo "Repository: $GITHUB_URL"

# Update package list and install git
apt-get update && apt-get install -y git

# Clone the repository
cd /
git clone $GITHUB_URL app
cd /app

# Check for requirements.txt and install dependencies
if [ -f requirements.txt ]; then
    echo "Found requirements.txt, installing dependencies..."
    pip install -r requirements.txt
else
    echo "WARNING: No requirements.txt found"
fi

# For now, try to detect and run the app
# In the future, this will just be 'setta'
if [ -f Procfile ]; then
    echo "Found Procfile"
    # Extract web command from Procfile
    WEB_CMD=$(grep "^web:" Procfile | sed 's/^web: //')
    echo "Running: $WEB_CMD"
    exec $WEB_CMD
elif [ -f app.py ]; then
    echo "Found app.py"
    # Try to run with gunicorn first (common for production)
    if pip list | grep -q gunicorn; then
        exec gunicorn app:app --bind 0.0.0.0:8080
    elif pip list | grep -q uvicorn; then
        exec uvicorn app:app --host 0.0.0.0 --port 8080
    else
        # Fallback to direct python execution
        exec python app.py
    fi
elif [ -f main.py ]; then
    echo "Found main.py"
    if pip list | grep -q uvicorn; then
        exec uvicorn main:app --host 0.0.0.0 --port 8080
    else
        exec python main.py
    fi
else
    echo "ERROR: No app.py or main.py found!"
    echo "Directory contents:"
    ls -la
    # Keep container running for debugging
    exec sleep infinity
fi
"""
