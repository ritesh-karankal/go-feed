# ============================================================
# Build stage
# ============================================================
FROM golang:1.26.3-alpine AS builder

WORKDIR /src

# Build dependencies only
RUN apk add --no-cache ca-certificates tzdata

# Cache Go dependencies separately from application source
COPY go.mod go.sum ./
RUN go mod download

# Copy application source
COPY . .

# Build a static, stripped binary
ARG TARGETOS
ARG TARGETARCH

RUN CGO_ENABLED=0 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH:-amd64} \
    go build \
      -trimpath \
      -ldflags="-s -w" \
      -o /out/api \
      ./cmd/api


# ============================================================
# Runtime stage
# ============================================================
FROM scratch

# OCI metadata
LABEL org.opencontainers.image.title="go-feed-api"
LABEL org.opencontainers.image.description="Go Feed API"
LABEL org.opencontainers.image.source="https://github.com/ritesh-karankal/go-feed"

# CA certificates for outbound HTTPS
COPY --from=builder /etc/ssl/certs/ca-certificates.crt \
    /etc/ssl/certs/ca-certificates.crt

# Timezone database
COPY --from=builder /usr/share/zoneinfo \
    /usr/share/zoneinfo

# Non-root user
COPY --from=builder /etc/passwd /etc/passwd
COPY --from=builder /etc/group /etc/group

# Application
COPY --from=builder /out/api /api

USER 65534:65534

EXPOSE 8080

ENTRYPOINT ["/api"]