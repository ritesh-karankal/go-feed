# ============================================================
# Build stage
# ============================================================
FROM golang:1.26.6-alpine AS builder

WORKDIR /src

# Build dependencies only
RUN apk add --no-cache ca-certificates tzdata

# Cache Go dependencies separately from application source
COPY go.mod go.sum ./
RUN go mod download

# Copy application source
COPY . .

# Build a static, stripped binary.
# CMD selects the program under ./cmd: "api" (default) or "migrate".
ARG CMD=api
# Release version baked into the binary (main.version); CI passes git describe
ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH

RUN CGO_ENABLED=0 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH:-amd64} \
    go build \
      -trimpath \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /out/app \
      ./cmd/${CMD}


# ============================================================
# Runtime stage
# ============================================================
FROM scratch

ARG CMD=api

# OCI metadata
LABEL org.opencontainers.image.title="go-feed-${CMD}"
LABEL org.opencontainers.image.description="Go Feed ${CMD}"
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
COPY --from=builder /out/app /app

USER 65534:65534

EXPOSE 8080

ENTRYPOINT ["/app"]