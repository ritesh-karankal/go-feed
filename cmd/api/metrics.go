package main

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics, exposed at /metrics (outside /v1, so the ALB doesn't
// route it publicly; Prometheus scrapes the pods directly).
var (
	httpRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests by method, route pattern and status code.",
	}, []string{"method", "route", "status"})

	httpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request latency by method and route pattern.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route"})
)

// registerRuntimeMetrics adds the database pool stats and build info. The
// default registry already includes Go runtime and process metrics.
func registerRuntimeMetrics(db *sql.DB) {
	prometheus.MustRegister(collectors.NewDBStatsCollector(db, "socialnetwork"))

	buildInfo := promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "go_feed_build_info",
		Help: "Build information; always 1.",
	}, []string{"version"})
	buildInfo.WithLabelValues(version).Set(1)
}

func (app *application) metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		next.ServeHTTP(ww, r)

		// Use the route pattern (/v1/posts/{postID}), not the raw path, so
		// IDs don't create a new time series per request.
		route := chi.RouteContext(r.Context()).RoutePattern()
		if route == "" {
			route = "unmatched"
		}

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}

		httpRequestsTotal.WithLabelValues(r.Method, route, strconv.Itoa(status)).Inc()
		httpRequestDuration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
	})
}
