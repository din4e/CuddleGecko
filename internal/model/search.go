package model

import "time"

// Searchable entity types — the `type` discriminator of a SearchHit. Global
// search fans out over every workspace-scoped entity that carries user text.
const (
	SearchTypeContact     = "contact"
	SearchTypeInteraction = "interaction"
	SearchTypeReminder    = "reminder"
	SearchTypeEvent       = "event"
	SearchTypeTodo        = "todo"
	SearchTypeWorkout     = "workout"
	SearchTypeTransaction = "transaction"
	SearchTypeHabit       = "habit"
	SearchTypeTag         = "tag"
	SearchTypeBodyMetric  = "body_metric"
	SearchTypeWhiteboard  = "whiteboard"
)

// AllSearchTypes lists every searchable entity type. The search service uses
// it as the whitelist for the `types` filter parameter.
var AllSearchTypes = []string{
	SearchTypeContact,
	SearchTypeInteraction,
	SearchTypeReminder,
	SearchTypeEvent,
	SearchTypeTodo,
	SearchTypeWorkout,
	SearchTypeTransaction,
	SearchTypeHabit,
	SearchTypeTag,
	SearchTypeBodyMetric,
	SearchTypeWhiteboard,
}

// IsSearchType reports whether t is a known searchable entity type.
func IsSearchType(t string) bool {
	for _, known := range AllSearchTypes {
		if known == t {
			return true
		}
	}
	return false
}

// SearchHit is one global-search result row, unified across entity types.
// ID is the entity's own id (for todo subtask / workout exercise / whiteboard
// node matches it is the parent todo/workout/board id — the unit the UI can
// navigate to). MatchedFields carries the API field names that contain the
// query (e.g. "notes", "items"); clients localize the labels.
type SearchHit struct {
	Type          string    `json:"type"`
	ID            uint      `json:"id"`
	Title         string    `json:"title"`
	Subtitle      string    `json:"subtitle,omitempty"`
	Snippet       string    `json:"snippet,omitempty"`
	MatchedFields []string  `json:"matched_fields,omitempty"`
	ContactID     uint      `json:"contact_id,omitempty"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// SearchResults is the global-search response payload.
type SearchResults struct {
	Query string      `json:"query"`
	Total int         `json:"total"`
	Hits  []SearchHit `json:"hits"`
}
