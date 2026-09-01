package service

import "context"

// --- Real-time change notification (multi-device sync, all domains) ---

// ChangeKind classifies a mutation for downstream sync listeners.
type ChangeKind string

const (
	ChangeCreated      ChangeKind = "created"
	ChangeUpdated      ChangeKind = "updated"
	ChangeDeleted      ChangeKind = "deleted"
	ChangeItemsChanged ChangeKind = "items_changed"
	ChangeBulk         ChangeKind = "bulk"
)

// Resource names identify the changed domain on the wire. They deliberately
// match the frontend query-cache scopes (web/src/hooks/api/*) so the client can
// map a frame straight onto its query keys.
const (
	ResourceTodo             = "todos"
	ResourceContact          = "contacts"
	ResourceTag              = "tags"
	ResourceRelation         = "relations"
	ResourceEvent            = "events"
	ResourceInteraction      = "interactions"
	ResourceReminder         = "reminders"
	ResourceTransaction      = "transactions"
	ResourceWorkout          = "workouts"
	ResourceBodyMetric       = "body-metrics"
	ResourceHabit            = "habits"
	ResourcePomodoro         = "pomodoros"
	ResourceExerciseLibrary  = "exercise-library"
	ResourceWorkoutTemplate  = "workout-templates"
	ResourceFitnessGoal      = "fitness-goals"
	ResourceWorkoutSetLog    = "workout-set-logs"
)

// ChangeNotifier receives a best-effort notification whenever a workspace-
// scoped entity changes. The realtime hub implements this so other devices in
// the same workspace can sync. Entity, when non-nil, is the post-mutation
// object serialized exactly like the REST API returns it, letting clients patch
// caches without a refetch. Implementations must be safe to call from any
// goroutine and must not block the caller — services treat notifications as
// fire-and-forget.
type ChangeNotifier interface {
	NotifyChange(ctx context.Context, workspaceID uint, resource string, kind ChangeKind, id uint, entity any)
}

// noopChangeNotifier is the default notifier: notifications are discarded
// (tests, dev, or any deployment without a realtime hub wired in).
type noopChangeNotifier struct{}

func (noopChangeNotifier) NotifyChange(context.Context, uint, string, ChangeKind, uint, any) {}

// firstNotifier picks the first non-nil notifier from a service constructor's
// variadic tail (nil when none given — notifyChange then no-ops).
func firstNotifier(notifiers []ChangeNotifier) ChangeNotifier {
	for _, n := range notifiers {
		if n != nil {
			return n
		}
	}
	return nil
}

// notifyChange fires a best-effort notification through n (no-op when nil).
// Like the per-service notify helpers it is only called after the underlying
// repo mutation succeeded and must never block the caller.
func notifyChange(ctx context.Context, n ChangeNotifier, workspaceID uint, resource string, kind ChangeKind, id uint, entity any) {
	if n != nil {
		n.NotifyChange(ctx, workspaceID, resource, kind, id, entity)
	}
}
