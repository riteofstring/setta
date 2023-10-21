./build.sh && \
filepath=$(find dist -type f -name "*.tar.gz") && \
. ./activate.sh && \
pip install $filepath && \
./cleanup.sh