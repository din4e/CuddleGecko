package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
)

type ExportData struct {
	Version    string        `json:"version"`
	ExportedAt time.Time     `json:"exported_at"`
	Data       ExportPayload `json:"data"`
}

type ExportPayload struct {
	Contacts     []model.Contact        `json:"contacts"`
	Tags         []model.Tag            `json:"tags"`
	Interactions []model.Interaction    `json:"interactions"`
	Reminders    []model.Reminder       `json:"reminders"`
	Relations    []model.ContactRelation `json:"relations"`
}

type ExportService struct {
	contactRepo     ContactRepository
	tagRepo         TagRepository
	interactionRepo InteractionRepository
	reminderRepo    ReminderRepository
	relationRepo    RelationRepository
}

func NewExportService(
	contactRepo ContactRepository,
	tagRepo TagRepository,
	interactionRepo InteractionRepository,
	reminderRepo ReminderRepository,
	relationRepo RelationRepository,
) *ExportService {
	return &ExportService{
		contactRepo:     contactRepo,
		tagRepo:         tagRepo,
		interactionRepo: interactionRepo,
		reminderRepo:    reminderRepo,
		relationRepo:    relationRepo,
	}
}

func (s *ExportService) ExportJSON(ctx context.Context, workspaceID uint) (string, error) {
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 10000, "", nil)
	if err != nil {
		return "", fmt.Errorf("export contacts: %w", err)
	}

	tags, _, err := s.tagRepo.List(ctx, workspaceID, 1, 10000)
	if err != nil {
		return "", fmt.Errorf("export tags: %w", err)
	}

	relations, err := s.relationRepo.GetAllByWorkspace(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("export relations: %w", err)
	}

	var allInteractions []model.Interaction
	for _, c := range contacts {
		ints, _, err := s.interactionRepo.ListByContact(ctx, workspaceID, c.ID, 1, 10000)
		if err != nil {
			return "", fmt.Errorf("export interactions: %w", err)
		}
		allInteractions = append(allInteractions, ints...)
	}

	reminders, _, err := s.reminderRepo.List(ctx, workspaceID, "", 1, 10000)
	if err != nil {
		return "", fmt.Errorf("export reminders: %w", err)
	}

	data := ExportData{
		Version:    "1.0",
		ExportedAt: time.Now(),
		Data: ExportPayload{
			Contacts:     contacts,
			Tags:         tags,
			Interactions: allInteractions,
			Reminders:    reminders,
			Relations:    relations,
		},
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal export: %w", err)
	}
	return string(bytes), nil
}

func (s *ExportService) ImportJSON(ctx context.Context, userID, workspaceID uint, jsonData string) error {
	var data ExportData
	if err := json.Unmarshal([]byte(jsonData), &data); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	if data.Version == "" {
		return fmt.Errorf("missing version field")
	}

	// Tags first (contacts may reference them)
	rawTags, _ := json.Marshal(data.Data.Tags)
	var tags []struct {
		ID    uint   `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.Unmarshal(rawTags, &tags); err != nil {
		return err
	}
	for _, t := range tags {
		newTag := &model.Tag{UserID: userID, WorkspaceID: workspaceID, Name: t.Name, Color: t.Color}
		if err := s.tagRepo.Create(ctx, newTag); err != nil {
			continue
		}
	}

	// Contacts
	rawContacts, _ := json.Marshal(data.Data.Contacts)
	var contacts []struct {
		ID                 uint     `json:"id"`
		Name               string   `json:"name"`
		Nickname           string   `json:"nickname"`
		AvatarURL          string   `json:"avatar_url"`
		Phone              []string `json:"phones"`
		Email              []string `json:"emails"`
		Birthday           string   `json:"birthday"`
		Notes              string   `json:"notes"`
		RelationshipLabels []string `json:"relationship_labels"`
	}
	if err := json.Unmarshal(rawContacts, &contacts); err != nil {
		return err
	}
	contactIDMap := make(map[uint]uint)
	for _, c := range contacts {
		var birthday *time.Time
		if c.Birthday != "" {
			t, err := time.Parse(time.RFC3339, c.Birthday)
			if err == nil {
				birthday = &t
			}
		}
		newContact := &model.Contact{
			UserID:             userID,
			WorkspaceID:        workspaceID,
			Name:               c.Name,
			Nickname:           c.Nickname,
			AvatarURL:          c.AvatarURL,
			Phone:              c.Phone,
			Email:              c.Email,
			Birthday:           birthday,
			Notes:              c.Notes,
			RelationshipLabels: c.RelationshipLabels,
		}
		if err := s.contactRepo.Create(ctx, newContact); err != nil {
			continue
		}
		contactIDMap[c.ID] = newContact.ID
	}

	// Interactions
	rawInteractions, _ := json.Marshal(data.Data.Interactions)
	var interactions []struct {
		ContactID  uint   `json:"contact_id"`
		Type       string `json:"type"`
		Title      string `json:"title"`
		Content    string `json:"content"`
		OccurredAt string `json:"occurred_at"`
	}
	if err := json.Unmarshal(rawInteractions, &interactions); err != nil {
		return err
	}
	for _, i := range interactions {
		newContactID, ok := contactIDMap[i.ContactID]
		if !ok {
			continue
		}
		occurredAt, _ := time.Parse(time.RFC3339, i.OccurredAt)
		newInt := &model.Interaction{
			UserID:      userID,
			WorkspaceID: workspaceID,
			ContactID:   newContactID,
			Type:        model.InteractionType(i.Type),
			Title:       i.Title,
			Content:     i.Content,
			OccurredAt:  occurredAt,
		}
		if err := s.interactionRepo.Create(ctx, newInt); err != nil {
			continue
		}
	}

	// Reminders
	rawReminders, _ := json.Marshal(data.Data.Reminders)
	var reminders []struct {
		ContactID   uint   `json:"contact_id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		RemindAt    string `json:"remind_at"`
		Status      string `json:"status"`
	}
	if err := json.Unmarshal(rawReminders, &reminders); err != nil {
		return err
	}
	for _, r := range reminders {
		newContactID, ok := contactIDMap[r.ContactID]
		if !ok {
			continue
		}
		remindAt, _ := time.Parse(time.RFC3339, r.RemindAt)
		newRem := &model.Reminder{
			UserID:      userID,
			WorkspaceID: workspaceID,
			ContactID:   newContactID,
			Title:       r.Title,
			Description: r.Description,
			RemindAt:    remindAt,
			Status:      model.ReminderStatus(r.Status),
		}
		if err := s.reminderRepo.Create(ctx, newRem); err != nil {
			continue
		}
	}

	// Relations
	rawRelations, _ := json.Marshal(data.Data.Relations)
	var relations []struct {
		ContactIDA   uint   `json:"contact_id_a"`
		ContactIDB   uint   `json:"contact_id_b"`
		RelationType string `json:"relation_type"`
	}
	if err := json.Unmarshal(rawRelations, &relations); err != nil {
		return err
	}
	for _, r := range relations {
		newA, okA := contactIDMap[r.ContactIDA]
		newB, okB := contactIDMap[r.ContactIDB]
		if !okA || !okB {
			continue
		}
		newRel := &model.ContactRelation{
			UserID:       userID,
			WorkspaceID:  workspaceID,
			ContactIDA:   newA,
			ContactIDB:   newB,
			RelationType: r.RelationType,
		}
		if err := s.relationRepo.Create(ctx, newRel); err != nil {
			continue
		}
	}

	return nil
}
