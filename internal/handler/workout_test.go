package handler

import (
	"encoding/json"
	"strconv"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupWorkoutIntegrationRouter(t *testing.T) *gin.Engine {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Workout{}, &model.WorkoutExercise{}, &model.BodyMetric{}))
	svc := service.NewWorkoutService(repository.NewWorkoutRepo(db), repository.NewWorkoutExerciseRepo(db), repository.NewBodyMetricRepo(db))
	h := NewWorkoutHandler(svc)

	r := gin.New()
	api := r.Group("/api")
	api.Use(func(c *gin.Context) {
		c.Set("user_id", uint(1))
		c.Set("workspace_id", uint(1))
		c.Next()
	})
	{
		api.GET("/workouts", h.List)
		api.GET("/workouts/stats", h.Stats)
		api.POST("/workouts", h.Create)
		api.PUT("/workouts/:id", h.Update)
		api.PATCH("/workouts/:id/toggle", h.ToggleStatus)
		api.DELETE("/workouts/:id", h.Delete)
		api.GET("/workouts/:id/exercises", h.ListExercises)
		api.POST("/workouts/:id/exercises", h.CreateExercise)
		api.PUT("/workouts/:id/exercises/:exerciseId", h.UpdateExercise)
		api.PATCH("/workouts/:id/exercises/:exerciseId/toggle", h.ToggleExercise)
		api.DELETE("/workouts/:id/exercises/:exerciseId", h.DeleteExercise)
		api.GET("/body-metrics", h.ListMetrics)
		api.GET("/body-metrics/summary", h.BodySummary)
		api.POST("/body-metrics", h.CreateMetric)
		api.DELETE("/body-metrics/:id", h.DeleteMetric)
	}
	return r
}

// utoa formats a uint id for path building.
func utoa(id uint) string { return strconv.FormatUint(uint64(id), 10) }

func decodeWorkout(t *testing.T, data json.RawMessage) model.Workout {
	t.Helper()
	var w model.Workout
	require.NoError(t, json.Unmarshal(data, &w))
	return w
}

// TestWorkoutHandler_FullFlow drives the workout + exercise + body-metric HTTP
// surface end to end: create → list → toggle → exercise lifecycle → body summary.
func TestWorkoutHandler_FullFlow(t *testing.T) {
	router := setupWorkoutIntegrationRouter(t)

	// Create a workout.
	env, code := doReq(t, router, "POST", "/api/workouts", map[string]interface{}{
		"name": "push day", "type": "strength", "intensity": "high",
	})
	require.Equal(t, 201, code)
	w := decodeWorkout(t, env.Data)
	assert.Equal(t, "push day", w.Name)
	assert.Equal(t, model.WorkoutStatusPlanned, w.Status)

	// Create an exercise under it.
	env, code = doReq(t, router, "POST", "/api/workouts/"+utoa(w.ID)+"/exercises", map[string]interface{}{
		"name": "bench press", "sets": 4, "reps": 8, "weight": 60,
	})
	require.Equal(t, 201, code)
	var ex model.WorkoutExercise
	require.NoError(t, json.Unmarshal(env.Data, &ex))
	assert.Equal(t, "bench press", ex.Name)

	// Toggle the exercise complete → parent progress should reflect 1/1.
	_, code = doReq(t, router, "PATCH", "/api/workouts/"+utoa(w.ID)+"/exercises/"+utoa(ex.ID)+"/toggle", nil)
	require.Equal(t, 200, code)

	// List workouts — the denormalized counts must have advanced.
	env, _ = doReq(t, router, "GET", "/api/workouts", nil)
	var page struct {
		Items []model.Workout `json:"items"`
		Total int64           `json:"total"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &page))
	require.Len(t, page.Items, 1)
	assert.Equal(t, 1, page.Items[0].ItemTotal)
	assert.Equal(t, 1, page.Items[0].ItemDone)

	// Toggle the workout completed.
	env, code = doReq(t, router, "PATCH", "/api/workouts/"+utoa(w.ID)+"/toggle", nil)
	require.Equal(t, 200, code)
	assert.Equal(t, model.WorkoutStatusCompleted, decodeWorkout(t, env.Data).Status)

	// Stats now report one completed workout.
	env, _ = doReq(t, router, "GET", "/api/workouts/stats", nil)
	var stats model.WorkoutStats
	require.NoError(t, json.Unmarshal(env.Data, &stats))
	assert.Equal(t, int64(1), stats.Completed)

	// Body metrics: record two, summary reports count + trend.
	_, _ = doReq(t, router, "POST", "/api/body-metrics", map[string]interface{}{
		"recorded_at": "2026-07-01T08:00:00Z", "weight": 70.0, "height": 175,
	})
	_, _ = doReq(t, router, "POST", "/api/body-metrics", map[string]interface{}{
		"recorded_at": "2026-07-08T08:00:00Z", "weight": 69.0, "height": 175,
	})
	env, _ = doReq(t, router, "GET", "/api/body-metrics/summary", nil)
	var sum model.BodyMetricSummary
	require.NoError(t, json.Unmarshal(env.Data, &sum))
	assert.Equal(t, int64(2), sum.Count)
	assert.Equal(t, "down", sum.WeightTrend)

	// Delete the workout → list is empty.
	_, code = doReq(t, router, "DELETE", "/api/workouts/"+utoa(w.ID), nil)
	require.Equal(t, 200, code)
	env, _ = doReq(t, router, "GET", "/api/workouts", nil)
	require.NoError(t, json.Unmarshal(env.Data, &page))
	assert.Equal(t, int64(0), page.Total)
}
