#!/bin/bash

conda deactivate
# Activate the virtual environment
source .venv/bin/activate

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "   Copy .env.example to .env and fill in your values"
    echo ""
fi

# Run uvicorn with the correct Python
echo "Starting development server..."
echo "API will be available at http://localhost:8000"
echo "API docs at http://localhost:8000/docs"
echo ""

python -m uvicorn main:app --reload --port 8000
