import sys
import os
from pathlib import Path

# Add the project root directory to the Python path to enable imports
project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
