./build.sh && \
filepath=$(find dist -type f -name "*.tar.gz") && \
pip install $filepath && \
./cleanup.sh