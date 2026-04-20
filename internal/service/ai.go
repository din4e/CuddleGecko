package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/llm"
	"gorm.io/gorm"
)

var (
	ErrProviderNotFound     = errors.New("AI provider not found")
	ErrNoActiveProvider     = errors.New("no active AI provider configured")
	ErrConversationNotFound = errors.New("conversation not found")
)

type AIRepository interface {
	CreateProvider(ctx context.Context, p *model.AIProvider) error
	GetProviderByID(ctx context.Context, userID, id uint) (*model.AIProvider, error)
	GetActiveProvider(ctx context.Context, userID uint) (*model.AIProvider, error)
	GetProviderByType(ctx context.Context, userID uint, providerType string) (*model.AIProvider, error)
	ListProviders(ctx context.Context, userID uint) ([]model.AIProvider, error)
	UpdateProvider(ctx context.Context, p *model.AIProvider) error
	DeactivateAllProviders(ctx context.Context, userID uint) error
	CreateConversation(ctx context.Context, c *model.AIConversation) error
	GetConversationByID(ctx context.Context, userID, id uint) (*model.AIConversation, error)
	ListConversations(ctx context.Context, userID uint, page, pageSize int) ([]model.AIConversation, int64, error)
	DeleteConversation(ctx context.Context, userID, id uint) error
	CreateMessage(ctx context.Context, m *model.AIMessage) error
	ListMessagesByConversation(ctx context.Context, conversationID uint) ([]model.AIMessage, error)
}

type AIService struct {
	aiRepo          AIRepository
	contactRepo     ContactRepository
	eventRepo       EventRepository
	interactionRepo InteractionRepository
	transactionRepo TransactionRepository
	relationRepo    RelationRepository
}

func NewAIService(
	aiRepo AIRepository,
	contactRepo ContactRepository,
	eventRepo EventRepository,
	interactionRepo InteractionRepository,
	transactionRepo TransactionRepository,
	relationRepo RelationRepository,
) *AIService {
	return &AIService{
		aiRepo:          aiRepo,
		contactRepo:     contactRepo,
		eventRepo:       eventRepo,
		interactionRepo: interactionRepo,
		transactionRepo: transactionRepo,
		relationRepo:    relationRepo,
	}
}

// --- Provider management ---

func (s *AIService) ListProviders(ctx context.Context, userID uint) ([]model.AIProvider, error) {
	providers, err := s.aiRepo.ListProviders(ctx, userID)
	if err != nil {
		return nil, err
	}
	// Mask API keys
	for i := range providers {
		providers[i].APIKey = maskKey(providers[i].APIKey)
	}
	return providers, nil
}

func (s *AIService) SaveProvider(ctx context.Context, userID uint, providerType, apiKey, modelName, customBaseURL string) (*model.AIProvider, error) {
	preset, ok := GetPresetByType(providerType)
	if !ok {
		return nil, fmt.Errorf("unknown provider type: %s", providerType)
	}

	baseURL := preset.BaseURL
	if customBaseURL != "" {
		baseURL = customBaseURL
	}
	if baseURL == "" {
		return nil, fmt.Errorf("base URL is required")
	}

	if modelName == "" {
		modelName = preset.DefaultModel
	}

	// Try to find existing provider of this type for this user
	existing, err := s.aiRepo.GetProviderByType(ctx, userID, providerType)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if existing != nil {
		// Update existing
		existing.APIKey = apiKey
		existing.Model = modelName
		existing.BaseURL = baseURL
		if err := s.aiRepo.UpdateProvider(ctx, existing); err != nil {
			return nil, err
		}
		result := *existing
		result.APIKey = maskKey(result.APIKey)
		return &result, nil
	}

	// Create new
	p := &model.AIProvider{
		UserID:       userID,
		ProviderType: providerType,
		Name:         preset.Name,
		BaseURL:      baseURL,
		APIKey:       apiKey,
		Model:        modelName,
		IsActive:     false,
	}
	if err := s.aiRepo.CreateProvider(ctx, p); err != nil {
		return nil, err
	}
	p.APIKey = maskKey(p.APIKey)
	return p, nil
}

func (s *AIService) ActivateProvider(ctx context.Context, userID, providerID uint) error {
	provider, err := s.aiRepo.GetProviderByID(ctx, userID, providerID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProviderNotFound
		}
		return err
	}

	if err := s.aiRepo.DeactivateAllProviders(ctx, userID); err != nil {
		return err
	}

	provider.IsActive = true
	return s.aiRepo.UpdateProvider(ctx, provider)
}

func (s *AIService) TestConnection(ctx context.Context, userID, providerID uint) error {
	provider, err := s.aiRepo.GetProviderByID(ctx, userID, providerID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProviderNotFound
		}
		return err
	}

	client := llm.NewClient(provider.BaseURL, provider.APIKey, provider.Model)
	return client.TestConnection(ctx)
}

func (s *AIService) getActiveClient(ctx context.Context, userID uint) (*llm.Client, error) {
	provider, err := s.aiRepo.GetActiveProvider(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNoActiveProvider
		}
		return nil, err
	}
	return llm.NewClient(provider.BaseURL, provider.APIKey, provider.Model), nil
}

// --- Conversation management ---

func (s *AIService) CreateConversation(ctx context.Context, userID uint, title string) (*model.AIConversation, error) {
	conv := &model.AIConversation{
		UserID: userID,
		Title:  title,
	}
	if err := s.aiRepo.CreateConversation(ctx, conv); err != nil {
		return nil, err
	}
	return conv, nil
}

func (s *AIService) ListConversations(ctx context.Context, userID uint, page, pageSize int) ([]model.AIConversation, int64, error) {
	return s.aiRepo.ListConversations(ctx, userID, page, pageSize)
}

func (s *AIService) GetMessages(ctx context.Context, userID, conversationID uint) ([]model.AIMessage, error) {
	_, err := s.aiRepo.GetConversationByID(ctx, userID, conversationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}
	return s.aiRepo.ListMessagesByConversation(ctx, conversationID)
}

func (s *AIService) DeleteConversation(ctx context.Context, userID, id uint) error {
	_, err := s.aiRepo.GetConversationByID(ctx, userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrConversationNotFound
		}
		return err
	}
	return s.aiRepo.DeleteConversation(ctx, userID, id)
}

// --- Chat ---

func (s *AIService) StreamChat(ctx context.Context, userID, conversationID uint, userMessage string) (<-chan llm.StreamChunk, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return nil, err
	}

	conv, err := s.aiRepo.GetConversationByID(ctx, userID, conversationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}

	// Save user message
	if err := s.aiRepo.CreateMessage(ctx, &model.AIMessage{
		ConversationID: conversationID,
		Role:           model.AIMessageUser,
		Content:        userMessage,
	}); err != nil {
		return nil, err
	}

	// Load history
	messages, err := s.aiRepo.ListMessagesByConversation(ctx, conversationID)
	if err != nil {
		return nil, err
	}

	// Build system prompt
	systemPrompt, err := s.buildSystemPrompt(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("build system prompt: %w", err)
	}

	// Assemble LLM messages
	llmMessages := []llm.Message{{Role: "system", Content: systemPrompt}}
	for _, m := range messages {
		llmMessages = append(llmMessages, llm.Message{Role: string(m.Role), Content: m.Content})
	}

	// Update conversation title if first message
	if conv.Title == "" {
		title := userMessage
		if len(title) > 50 {
			title = title[:50] + "..."
		}
		conv.Title = title
		s.aiRepo.CreateConversation(ctx, conv) // best effort
	}

	stream, err := client.StreamChat(ctx, llmMessages)
	if err != nil {
		return nil, err
	}

	// Tee the stream: forward to caller channel while accumulating for DB save
	out := make(chan llm.StreamChunk, 64)
	go func() {
		defer close(out)
		var full strings.Builder
		for chunk := range stream {
			out <- chunk
			if chunk.Error != nil {
				return
			}
			if chunk.Done {
				s.aiRepo.CreateMessage(context.Background(), &model.AIMessage{
					ConversationID: conversationID,
					Role:           model.AIMessageAssistant,
					Content:        full.String(),
				})
				return
			}
			full.WriteString(chunk.Content)
		}
	}()

	return out, nil
}

func (s *AIService) Chat(ctx context.Context, userID, conversationID uint, userMessage string) (string, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return "", err
	}

	_, err = s.aiRepo.GetConversationByID(ctx, userID, conversationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrConversationNotFound
		}
		return "", err
	}

	// Save user message
	if err := s.aiRepo.CreateMessage(ctx, &model.AIMessage{
		ConversationID: conversationID,
		Role:           model.AIMessageUser,
		Content:        userMessage,
	}); err != nil {
		return "", err
	}

	// Load history
	messages, err := s.aiRepo.ListMessagesByConversation(ctx, conversationID)
	if err != nil {
		return "", err
	}

	systemPrompt, err := s.buildSystemPrompt(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("build system prompt: %w", err)
	}

	llmMessages := []llm.Message{{Role: "system", Content: systemPrompt}}
	for _, m := range messages {
		llmMessages = append(llmMessages, llm.Message{Role: string(m.Role), Content: m.Content})
	}

	resp, err := client.Chat(ctx, llmMessages)
	if err != nil {
		return "", err
	}

	// Save assistant response
	if err := s.aiRepo.CreateMessage(ctx, &model.AIMessage{
		ConversationID: conversationID,
		Role:           model.AIMessageAssistant,
		Content:        resp,
	}); err != nil {
		return "", err
	}

	return resp, nil
}

// --- Analysis ---

func (s *AIService) AnalyzeRelationship(ctx context.Context, userID, contactID uint) (string, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return "", err
	}

	contact, err := s.contactRepo.GetByID(ctx, userID, contactID)
	if err != nil {
		return "", fmt.Errorf("get contact: %w", err)
	}

	interactions, _, err := s.interactionRepo.ListByContact(ctx, userID, contactID, 1, 20)
	if err != nil {
		return "", fmt.Errorf("get interactions: %w", err)
	}

	relations, err := s.relationRepo.ListByContact(ctx, userID, contactID)
	if err != nil {
		return "", fmt.Errorf("get relations: %w", err)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Analyze the following personal relationship and provide insights on relationship quality, communication patterns, and suggestions for improvement.\n\n"))
	sb.WriteString(fmt.Sprintf("## Contact: %s\n", contact.Name))
	if len(contact.RelationshipLabels) > 0 {
		sb.WriteString(fmt.Sprintf("Labels: %s\n", strings.Join(contact.RelationshipLabels, ", ")))
	}
	if contact.Notes != "" {
		sb.WriteString(fmt.Sprintf("Notes: %s\n", contact.Notes))
	}
	sb.WriteString("\n")

	if len(interactions) > 0 {
		sb.WriteString("### Recent Interactions\n")
		for _, i := range interactions {
			sb.WriteString(fmt.Sprintf("- [%s] %s (%s): %s\n", i.Type, i.Title, i.OccurredAt.Format("2006-01-02"), truncate(i.Content, 100)))
		}
	} else {
		sb.WriteString("No recorded interactions.\n")
	}

	if len(relations) > 0 {
		sb.WriteString("\n### Relations\n")
		for _, r := range relations {
			sb.WriteString(fmt.Sprintf("- %s\n", r.RelationType))
		}
	}

	messages := []llm.Message{
		{Role: "system", Content: "You are a personal relationship analysis assistant. Provide thoughtful, constructive analysis in the user's language. Be specific and actionable."},
		{Role: "user", Content: sb.String()},
	}

	return client.Chat(ctx, messages)
}

func (s *AIService) AnalyzeEvent(ctx context.Context, userID, eventID uint) (string, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return "", err
	}

	event, err := s.eventRepo.GetByID(ctx, userID, eventID)
	if err != nil {
		return "", fmt.Errorf("get event: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("Evaluate the importance of this event and provide preparation suggestions.\n\n")
	sb.WriteString(fmt.Sprintf("## Event: %s\n", event.Title))
	if event.Description != "" {
		sb.WriteString(fmt.Sprintf("Description: %s\n", event.Description))
	}
	sb.WriteString(fmt.Sprintf("Time: %s", event.StartTime.Format("2006-01-02 15:04")))
	if event.EndTime != nil {
		sb.WriteString(fmt.Sprintf(" - %s", event.EndTime.Format("2006-01-02 15:04")))
	}
	sb.WriteString("\n")
	if event.Location != "" {
		sb.WriteString(fmt.Sprintf("Location: %s\n", event.Location))
	}

	if len(event.ContactIDs) > 0 {
		sb.WriteString("\n### Related Contacts\n")
		for _, cid := range event.ContactIDs {
			contact, err := s.contactRepo.GetByID(ctx, userID, cid)
			if err == nil {
				sb.WriteString(fmt.Sprintf("- %s (%s)\n", contact.Name, strings.Join(contact.RelationshipLabels, ", ")))
			}
		}
	}

	messages := []llm.Message{
		{Role: "system", Content: "You are a personal event analysis assistant. Evaluate importance (critical/important/normal) and provide preparation advice. Respond in the user's language."},
		{Role: "user", Content: sb.String()},
	}

	return client.Chat(ctx, messages)
}

// --- System prompt building ---

func (s *AIService) buildSystemPrompt(ctx context.Context, userID uint) (string, error) {
	var sb strings.Builder
	sb.WriteString("You are CuddleGecko AI, a personal CRM assistant. You help the user manage and understand their relationships. Answer questions about their data or provide relationship advice.\n\n")

	// Contacts
	contacts, _, err := s.contactRepo.List(ctx, userID, 1, 50, "", nil)
	if err == nil && len(contacts) > 0 {
		sb.WriteString(fmt.Sprintf("## Contacts (%d shown)\n", len(contacts)))
		for _, c := range contacts {
			labels := strings.Join(c.RelationshipLabels, ", ")
			if labels != "" {
				labels = " [" + labels + "]"
			}
			sb.WriteString(fmt.Sprintf("- %s%s", c.Name, labels))
			if c.Notes != "" {
				sb.WriteString(fmt.Sprintf(": %s", truncate(c.Notes, 80)))
			}
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}

	// Recent events
	events, _, err := s.eventRepo.List(ctx, userID, 1, 10, nil, nil)
	if err == nil && len(events) > 0 {
		sb.WriteString("## Recent Events\n")
		for _, e := range events {
			sb.WriteString(fmt.Sprintf("- %s (%s)\n", e.Title, e.StartTime.Format("2006-01-02")))
		}
		sb.WriteString("\n")
	}

	// Financial summary
	income, expense, err := s.transactionRepo.Summary(ctx, userID)
	if err == nil {
		sb.WriteString(fmt.Sprintf("## Financial Summary\n- Income: %.2f\n- Expense: %.2f\n- Balance: %.2f\n\n", income, expense, income-expense))
	}

	return sb.String(), nil
}

// --- Helpers ---

func maskKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return "****" + key[len(key)-4:]
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
