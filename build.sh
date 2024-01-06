./cleanup.sh && \
cd frontend && yarn build && cd .. && \
cp -r frontend/dist python/runcoder/frontend && \
python -m build