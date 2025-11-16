. ./activate.sh
./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
mkdir -p backend/setta/static && \
rm -rf backend/setta/static/frontend && \
cp -r frontend/dist backend/setta/static/frontend && \
if [ ! -f backend/setta/static/portkey_gateway/package.json ]; then \
  echo "Missing Portkey gateway bundle. See backend/setta/static/portkey_gateway/README.md"; \
  exit 1; \
fi && \
python -m build
