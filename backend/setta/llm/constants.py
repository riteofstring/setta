"""Shared constants for the LLM configuration files."""

from pathlib import Path

from setta.utils.constants import C

CONFIG_FILENAME = "llm_config.json"
DEFAULT_GATEWAY_URL = "http://127.0.0.1:8787"
CONFIG_PATH: Path = C.SETTA_FILES_FOLDER / CONFIG_FILENAME
