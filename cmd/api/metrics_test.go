package main

import (
	"net/http"
	"strings"
	"testing"
)

func TestMetricsEndpoint(t *testing.T) {
	app := newTestApplication(t, config{})
	mux := app.mount()

	req, err := http.NewRequest(http.MethodGet, "/v1/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	if rr := executeRequest(req, mux); rr.Code != http.StatusOK {
		t.Fatalf("expected health status %d; got %d", http.StatusOK, rr.Code)
	}

	// A route with an ID, rejected by auth: must be recorded by its pattern,
	// never by the raw path
	req, err = http.NewRequest(http.MethodGet, "/v1/users/123", nil)
	if err != nil {
		t.Fatal(err)
	}
	executeRequest(req, mux)

	req, err = http.NewRequest(http.MethodGet, "/metrics", nil)
	if err != nil {
		t.Fatal(err)
	}
	rr := executeRequest(req, mux)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected metrics status %d; got %d", http.StatusOK, rr.Code)
	}

	body := rr.Body.String()

	want := `http_requests_total{method="GET",route="/v1/health",status="200"}`
	if !strings.Contains(body, want) {
		t.Errorf("expected metrics to contain %s", want)
	}

	if strings.Contains(body, `route="/v1/users/123"`) {
		t.Error("expected route label to use the route pattern, not the raw path")
	}

	if !strings.Contains(body, "http_request_duration_seconds_bucket") {
		t.Error("expected request duration histogram in metrics")
	}
}
