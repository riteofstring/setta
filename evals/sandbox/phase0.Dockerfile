FROM scratch

COPY --chmod=0555 codex /usr/local/bin/codex
COPY --chmod=0555 rg /usr/local/bin/rg
COPY --chmod=0555 sandbox-helper /usr/local/bin/setta-eval-sandbox-helper
COPY --chmod=0555 zsh /bin/zsh
COPY --chown=65532:65532 --chmod=0444 workspace-seed /workspace/.setta-eval-volume-seed

ENV HOME=/tmp \
    LANG=C.UTF-8 \
    PATH=/usr/local/bin:/bin \
    SHELL=/bin/zsh

USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/codex", "exec-server", "--strict-config", "--listen", "stdio://"]
