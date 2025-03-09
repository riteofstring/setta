#!/bin/bash
# Run this script from the project root directory

# Set Python path to include the project root
export PYTHONPATH=$(pwd)

# Run the tests
pytest backend/tests "$@"

# Display coverage report if the --cov flag was passed
if [[ "$*" == *--cov* ]]; then
    echo ""
    echo "Coverage Report:"
    coverage report -m
fi 