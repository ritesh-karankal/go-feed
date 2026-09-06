package main

import (
	"net/http"
)

// healthCheckHandler godoc
//
//	@Summary		Health check
//	@Description	Check API health
//	@Tags			health
//	@Produce		json
//	@Security		BasicAuth
//	@Success		200	{object}	string	"ok"
//	@Failure		401	{object}	map[string]interface{}
//	@Router			/health [get]
func (app *application) healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	data := map[string]string{
		"status":  "ok",
		"env":     app.config.env,
		"version": version,
	}

	if err := app.jsonResponse(w, http.StatusOK, data); err != nil {
		app.internalServerError(w, r, err)
	}
}
