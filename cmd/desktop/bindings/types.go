package bindings

import "time"

// Auth types
type AuthResult struct {
	User         any    `json:"user"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type CaptchaResult struct {
	Enabled bool   `json:"enabled"`
	ID      string `json:"captcha_id,omitempty"`
	Image   string `json:"captcha_image,omitempty"`
}

// Contact types
type CreateContactInput struct {
	Name               string     `json:"name"`
	Nickname           string     `json:"nickname"`
	AvatarURL          string     `json:"avatar_url"`
	Phone              string     `json:"phone"`
	Email              string     `json:"email"`
	Birthday           *time.Time `json:"birthday"`
	Notes              string     `json:"notes"`
	RelationshipLabels []string   `json:"relationship_labels"`
}

type UpdateContactInput = CreateContactInput

type ListContactsInput struct {
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
	Search   string `json:"search"`
	TagIDs   []uint `json:"tag_ids"`
}

type PaginatedContacts struct {
	Items    any `json:"items"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
}

// Tag types
type CreateTagInput struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type UpdateTagInput struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Interaction types
type PaginatedInteractions struct {
	Items any   `json:"items"`
	Total int64 `json:"total"`
}

type CreateInteractionInput struct {
	Type       string `json:"type"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	OccurredAt string `json:"occurred_at"`
}

type UpdateInteractionInput = CreateInteractionInput

// Reminder types
type CreateReminderInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	RemindAt    string `json:"remind_at"`
}

type UpdateReminderInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	RemindAt    string `json:"remind_at"`
	Status      string `json:"status"`
}

// Relation types
type CreateRelationInput struct {
	ContactIDB   uint   `json:"contact_id_b"`
	RelationType string `json:"relation_type"`
}

// Export types
type ExportData struct {
	Version    string        `json:"version"`
	ExportedAt time.Time     `json:"exported_at"`
	Data       ExportPayload `json:"data"`
}

type ExportPayload struct {
	Contacts     any `json:"contacts"`
	Tags         any `json:"tags"`
	Interactions any `json:"interactions"`
	Reminders    any `json:"reminders"`
	Relations    any `json:"relations"`
}
