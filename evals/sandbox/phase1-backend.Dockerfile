FROM scratch

COPY --chmod=0555 setta-backend /usr/local/bin/setta-backend
COPY --chmod=0555 setta-eval-provider-bridge /usr/local/bin/codex

ENV HOME=/tmp \
    LANG=C.UTF-8 \
    PATH=/usr/local/bin \
    TMPDIR=/tmp

USER 65532:65532
WORKDIR /app-data
EXPOSE 4310

ENTRYPOINT ["/usr/local/bin/setta-backend"]
