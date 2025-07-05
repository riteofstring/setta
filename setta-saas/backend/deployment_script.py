"""
Deployment scripts for Fly.io containers.
"""

# Storage-based deployment script (NEW)
STORAGE_DEPLOY_SCRIPT = """#!/bin/bash
set -e

echo "=== Starting storage-based deployment ==="
echo "User ID: $USER_ID"
echo "Project ID: $PROJECT_ID"

# Install required tools
apt-get update && apt-get install -y python3-pip curl

# Install AWS CLI for S3/R2 operations
pip install awscli

# Create app directory
mkdir -p /app
cd /app

# Sync from R2 storage
echo "Syncing project from storage..."
aws s3 sync s3://$STORAGE_BUCKET/$USER_ID/$PROJECT_ID/ /app \
  --endpoint-url $R2_ENDPOINT \
  --region auto

echo "Files synced:"
ls -la

# Install dependencies if requirements.txt exists
if [ -f requirements.txt ]; then
    echo "Found requirements.txt, installing..."
    pip install -r requirements.txt
else
    echo "No requirements.txt found"
fi

# Find and run the application
if [ -f app.py ]; then
    echo "Running app.py..."
    exec python app.py
elif [ -f main.py ]; then
    echo "Running main.py..."
    exec python main.py
else
    echo "ERROR: No app.py or main.py found!"
    echo "Directory contents:"
    ls -la
    # Keep container running for debugging
    exec sleep infinity
fi
"""

# Main deployment script used in production (OLD - for direct GitHub clone)
GITHUB_DEPLOY_SCRIPT = """#!/bin/bash
set -e

echo "=== Starting GitHub deployment ==="
echo "Repository: $GITHUB_URL"

# Get the PORT from environment, default to 8080
PORT=${PORT:-8080}
echo "Using PORT: $PORT"

# Update package list and install git
apt-get update && apt-get install -y git

# Clone the repository
cd /
git clone $GITHUB_URL app
cd /app

# Check for requirements.txt and install dependencies
if [ -f requirements.txt ]; then
    echo "Found requirements.txt, installing dependencies..."
    pip install --no-cache-dir -r requirements.txt
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
        exec gunicorn app:app --bind 0.0.0.0:$PORT
    elif pip list | grep -q uvicorn; then
        exec uvicorn app:app --host 0.0.0.0 --port $PORT
    else
        # Fallback to direct python execution
        exec python app.py
    fi
elif [ -f main.py ]; then
    echo "Found main.py"
    if pip list | grep -q uvicorn; then
        exec uvicorn main:app --host 0.0.0.0 --port $PORT
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

# Debug version with extra logging (can be used by setting an environment variable)
GITHUB_DEPLOY_SCRIPT_DEBUG = """#!/bin/bash
set -e

echo "=== Starting GitHub deployment (DEBUG MODE) ==="
echo "Repository: $GITHUB_URL"
echo "PORT environment variable: $PORT"
echo "Working directory: $(pwd)"

# Get the PORT from environment, default to 8080
PORT=${PORT:-8080}
echo "Using PORT: $PORT"

# Install required packages
echo "Installing git and curl..."
apt-get update && apt-get install -y git curl procps

# Clone the repository
echo "Cloning repository..."
cd /
git clone $GITHUB_URL app
cd /app
echo "Repository cloned. Contents:"
ls -la

# Check for requirements.txt
if [ -f requirements.txt ]; then
    echo "Found requirements.txt with contents:"
    cat requirements.txt
    echo "Installing dependencies..."
    pip install --no-cache-dir -r requirements.txt
    echo "Installed packages:"
    pip list
else
    echo "ERROR: No requirements.txt found!"
    exit 1
fi

# Function to test port binding
test_port() {
    echo "Testing if port $1 is available..."
    if lsof -i :$1 2>/dev/null; then
        echo "Port $1 is already in use!"
        lsof -i :$1
    else
        echo "Port $1 is available"
    fi
}

# Test ports
test_port 8080
test_port $PORT

# Start the application with detailed logging
echo "=== Starting application ==="
echo "Environment variables:"
env | grep -E "(PORT|PYTHON)" | sort

# Try to run the app
if [ -f app.py ]; then
    echo "Found app.py, checking for web server..."

    if pip list | grep -q uvicorn; then
        echo "Starting with uvicorn on 0.0.0.0:$PORT..."
        exec uvicorn app:app --host 0.0.0.0 --port $PORT --log-level info
    elif pip list | grep -q gunicorn; then
        echo "Starting with gunicorn on 0.0.0.0:$PORT..."
        exec gunicorn app:app --bind 0.0.0.0:$PORT --log-level info
    else
        echo "No ASGI/WSGI server found, running directly..."
        exec python -u app.py
    fi
elif [ -f main.py ]; then
    echo "Found main.py, starting..."
    if pip list | grep -q uvicorn; then
        exec uvicorn main:app --host 0.0.0.0 --port $PORT --log-level info
    else
        exec python -u main.py
    fi
else
    echo "ERROR: No app.py or main.py found!"
    echo "Directory contents:"
    ls -la
    exit 1
fi
"""
