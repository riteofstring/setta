# Keep the SDK contract version available without importing the generated
# Pydantic models so packaged plugin runtimes can validate the local-core
# handshake with only the published lightweight runtime surface.
SETTA_SDK_CONTRACT_VERSION = 2
