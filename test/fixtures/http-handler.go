// Package handler provides HTTP request handling with middleware support.
package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// Config holds server configuration.
type Config struct {
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	MaxBodySize  int64
}

// Response is a standard API response envelope.
type Response struct {
	Status  int         `json:"status"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	TraceID string      `json:"trace_id,omitempty"`
}

// Handler is the main HTTP handler with middleware chain.
type Handler struct {
	config     Config
	mux        *http.ServeMux
	middleware []Middleware
	mu         sync.RWMutex
	stats      RequestStats
}

// Middleware is a function that wraps an HTTP handler.
type Middleware func(http.Handler) http.Handler

// RequestStats tracks request metrics.
type RequestStats struct {
	TotalRequests  int64
	ActiveRequests int64
	ErrorCount     int64
	AvgLatencyMs   float64
}

// NewHandler creates a new handler with the given configuration.
func NewHandler(config Config) *Handler {
	h := &Handler{
		config: config,
		mux:    http.NewServeMux(),
	}

	// Register routes
	h.mux.HandleFunc("/health", h.handleHealth)
	h.mux.HandleFunc("/api/items", h.handleItems)
	h.mux.HandleFunc("/api/items/", h.handleItemByID)

	return h
}

// Use adds a middleware to the chain.
func (h *Handler) Use(mw Middleware) {
	h.middleware = append(h.middleware, mw)
}

// ServeHTTP implements the http.Handler interface.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Build middleware chain
	var handler http.Handler = h.mux
	for i := len(h.middleware) - 1; i >= 0; i-- {
		handler = h.middleware[i](handler)
	}
	handler.ServeHTTP(w, r)
}

// ─── Route handlers ───

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	h.mu.RLock()
	stats := h.stats
	h.mu.RUnlock()

	h.writeJSON(w, http.StatusOK, Response{
		Status: http.StatusOK,
		Data:   stats,
	})
}

func (h *Handler) handleItems(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.listItems(w, r)
	case http.MethodPost:
		h.createItem(w, r)
	default:
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) handleItemByID(w http.ResponseWriter, r *http.Request) {
	// Extract ID from path
	id := r.URL.Path[len("/api/items/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "missing item ID")
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.getItem(w, r, id)
	case http.MethodPut:
		h.updateItem(w, r, id)
	case http.MethodDelete:
		h.deleteItem(w, r, id)
	default:
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) listItems(w http.ResponseWriter, r *http.Request) {
	// Placeholder implementation
	h.writeJSON(w, http.StatusOK, Response{
		Status: http.StatusOK,
		Data:   []string{},
	})
}

func (h *Handler) createItem(w http.ResponseWriter, r *http.Request) {
	if r.Body == nil {
		h.writeError(w, http.StatusBadRequest, "request body required")
		return
	}

	var item map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		h.writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid JSON: %v", err))
		return
	}

	h.writeJSON(w, http.StatusCreated, Response{
		Status: http.StatusCreated,
		Data:   item,
	})
}

func (h *Handler) getItem(w http.ResponseWriter, r *http.Request, id string) {
	// Placeholder
	h.writeJSON(w, http.StatusOK, Response{
		Status: http.StatusOK,
		Data:   map[string]string{"id": id},
	})
}

func (h *Handler) updateItem(w http.ResponseWriter, r *http.Request, id string) {
	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	updates["id"] = id
	h.writeJSON(w, http.StatusOK, Response{
		Status: http.StatusOK,
		Data:   updates,
	})
}

func (h *Handler) deleteItem(w http.ResponseWriter, r *http.Request, id string) {
	log.Printf("deleted item: %s", id)
	w.WriteHeader(http.StatusNoContent)
}

// ─── Helpers ───

func (h *Handler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("failed to encode response: %v", err)
	}
}

func (h *Handler) writeError(w http.ResponseWriter, status int, message string) {
	h.mu.Lock()
	h.stats.ErrorCount++
	h.mu.Unlock()

	h.writeJSON(w, status, Response{
		Status: status,
		Error:  message,
	})
}

// LoggingMiddleware logs each request with timing.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		duration := time.Since(start)
		log.Printf("%s %s %v", r.Method, r.URL.Path, duration)
	})
}

// RecoveryMiddleware catches panics and returns 500.
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("panic recovered: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
