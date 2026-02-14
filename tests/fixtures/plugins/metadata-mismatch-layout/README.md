# metadata-mismatch-layout

Install-time failure fixture: archive contains multiple `setta.plugin.json` files and should fail with `PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT`.

This fixture is intentionally not a single plugin root. It is used to build package artifacts that contain multiple candidate plugin roots.
