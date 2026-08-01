ARG TOOLCHAIN_IMAGE
FROM ${TOOLCHAIN_IMAGE}

USER 0:0

COPY --chmod=0555 codex /usr/local/bin/codex
COPY --chmod=0555 rg /usr/local/bin/rg
COPY --chmod=0555 sandbox-helper /usr/local/bin/setta-eval-sandbox-helper
COPY --chmod=0555 zsh /bin/zsh

ENV HOME=/tmp \
    LANG=C.UTF-8 \
    PATH=/usr/local/bin:/usr/bin:/bin \
    SHELL=/bin/zsh

USER 65532:65532
WORKDIR /workspace
EXPOSE 4500

ENTRYPOINT ["/usr/local/bin/codex", "exec-server", "--strict-config", "--listen", "ws://0.0.0.0:4500"]
