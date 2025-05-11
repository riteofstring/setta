#!/bin/bash

# Activate the virtual environment directly
export PATH="$PWD/.venv/bin:$PATH"

# Run uvicorn with the correct Python
.venv/bin/python -m uvicorn main:app --reload --port 8001
