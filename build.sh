. ./activate.sh
./cleanup.sh && \
cd frontend && pnpm build && cd .. && \
mkdir -p backend/setta/static/portkey_gateway && \
GATEWAY_SRC=$(ls -d frontend/node_modules/.pnpm/@portkey-ai+gateway@*/node_modules/@portkey-ai/gateway 2>/dev/null | head -n 1) && \
if [ -z "$GATEWAY_SRC" ]; then echo "Portkey gateway package not found. Run pnpm install."; exit 1; fi && \
rsync -aL --delete "$GATEWAY_SRC"/ backend/setta/static/portkey_gateway/ && \
mkdir -p backend/setta/static && \
cp -r frontend/dist backend/setta/static/frontend && \
python -m build
