package bindings

import (
	"context"
	"encoding/json"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
)

type ExportBinding struct {
	contactRepo     service.ContactRepository
	tagRepo         service.TagRepository
	interactionRepo service.InteractionRepository
	reminderRepo    service.ReminderRepository
	relationRepo    service.RelationRepository
}

func (b *ExportBinding) ExportJSON() (string, error) {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return "", ErrNotAuthenticated
	}

	contacts, _, err := b.contactRepo.List(ctx, userID, 1, 10000, "", nil)
	if err != nil {
		return "", err
	}

	tags, err := b.tagRepo.List(ctx, userID)
	if err != nil {
		return "", err
	}

	relations, err := b.relationRepo.GetAllByUser(ctx, userID)
	if err != nil {
		return "", err
	}

	var allInteractions []model.Interaction
	for _, c := range contacts {
		ints, _, err := b.interactionRepo.ListByContact(ctx, userID, c.ID, 1, 10000)
		if err != nil {
			return "", err
		}
		allInteractions = append(allInteractions, ints...)
	}

	reminders, err := b.reminderRepo.List(ctx, userID, "")
	if err != nil {
		return "", err
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
		return "", err
	}
	return string(bytes), nil
}

func (b *ExportBinding) ImportJSON(jsonData string) error {
	ctx := context.Background()
	userID := GetCurrentUserID()
	if userID == 0 {
		return ErrNotAuthenticated
	}

	var data ExportData
	if err := json.Unmarshal([]byte(jsonData), &data); err != nil {
		return err
	}

	if data.Version == "" {
		return ErrInvalidImportFormat
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
		newTag := &model.Tag{UserID: userID, Name: t.Name, Color: t.Color}
		if err := b.tagRepo.Create(ctx, newTag); err != nil {
			continue
		}
	}

	// Contacts
	rawContacts, _ := json.Marshal(data.Data.Contacts)
	var contacts []struct {
		ID                uint     `json:"id"`
		Name              string   `json:"name"`
		Nickname          string   `json:"nickname"`
		AvatarURL         string   `json:"avatar_url"`
		Phone             string   `json:"phone"`
		Email             string   `json:"email"`
		Birthday          string   `json:"birthday"`
		Notes             string   `json:"notes"`
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
			Name:               c.Name,
			Nickname:           c.Nickname,
			AvatarURL:          c.AvatarURL,
			Phone:              c.Phone,
			Email:              c.Email,
			Birthday:           birthday,
			Notes:              c.Notes,
			RelationshipLabels: c.RelationshipLabels,
		}
		if err := b.contactRepo.Create(ctx, newContact); err != nil {
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
			UserID:     userID,
			ContactID:  newContactID,
			Type:       model.InteractionType(i.Type),
			Title:      i.Title,
			Content:    i.Content,
			OccurredAt: occurredAt,
		}
		if err := b.interactionRepo.Create(ctx, newInt); err != nil {
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
			ContactID:   newContactID,
			Title:       r.Title,
			Description: r.Description,
			RemindAt:    remindAt,
			Status:      model.ReminderStatus(r.Status),
		}
		if err := b.reminderRepo.Create(ctx, newRem); err != nil {
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
			UserID:        userID,
			ContactIDA:    newA,
			ContactIDB:    newB,
			RelationType:  r.RelationType,
		}
		if err := b.relationRepo.Create(ctx, newRel); err != nil {
			continue
		}
	}

	return nil
}
