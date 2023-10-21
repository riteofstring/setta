rm -rfv build/ && \
rm -rfv dist/ && \
rm -rfv python/runcoder.egg-info/ && \
rm -rfv python/runcoder/frontend && \
cp -r frontend/dist python/runcoder/frontend && \
python -m build