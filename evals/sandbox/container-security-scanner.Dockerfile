FROM scratch

COPY --chmod=0555 trivy /usr/local/bin/trivy
COPY --chmod=0444 ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

ENV HOME=/tmp \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

USER 65532:65532
ENTRYPOINT ["/usr/local/bin/trivy"]
