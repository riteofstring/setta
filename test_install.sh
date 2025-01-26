# . ./init_env.sh test && \
pip install -e . && \
./build.sh && \
filepath=$(find dist -type f -name "*.tar.gz") && \
pip install --force-reinstall $filepath && \
./cleanup.sh