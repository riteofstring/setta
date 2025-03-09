# Tests for Setta Backend

This directory contains tests for the Setta backend modules.

## Running the Tests

### Prerequisites

- Python 3.6+
- pytest (install with `pip install pytest`)
- pytest-cov (install with `pip install pytest-cov`)

### Running all tests

From the project root directory:

```bash
# Make sure you're running from the project root, not from inside the backend directory
cd /path/to/setta
pytest backend/tests
```

If you encounter import errors, you can set the Python path explicitly:

```bash
PYTHONPATH=. pytest backend/tests
```

### Running specific test file

```bash
pytest backend/tests/test_utils.py
```

### Running specific test class or method

```bash
# Run a specific test class
pytest backend/tests/test_utils.py::TestMultireplace

# Run a specific test method
pytest backend/tests/test_utils.py::TestMultireplace::test_multireplace_basic
```

### Running tests with coverage

```bash
pytest --cov=backend.setta.utils backend/tests/test_utils.py
```

## Test Structure

- Each module in `backend/setta` has a corresponding test file named `test_*.py`
- Tests are organized by class, with each utility function having its own test class
- Each test method tests a specific aspect or edge case of the function

## Troubleshooting

If you encounter import errors, make sure you're running pytest from the project root directory, not from inside the backend directory. Alternatively, you can set the Python path explicitly as shown above.
