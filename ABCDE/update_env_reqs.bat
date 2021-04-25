conda env export | grep -v "^prefix: " > conda_complete_env.yaml
conda env export --from-history | grep -v "^prefix: " > conda_env.yaml