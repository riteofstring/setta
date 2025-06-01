#!/bin/bash

# Activate the virtual environment
source .venv/bin/activate

# Run uvicorn with the correct Python
python -m uvicorn main:app --reload --port 8000
