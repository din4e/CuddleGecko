package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/config"
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
	UpdateConversationTitle(ctx context.Context, userID, id uint, title string) error
	GetConversationByID(ctx context.Context, userID, id uint) (*model.AIConversation, error)
	ListConversations(ctx context.Context, userID uint, page, pageSize int) ([]model.AIConversation, int64, error)
	DeleteConversation(ctx context.Context, userID, id uint) error
	CreateMessage(ctx context.Context, m *model.AIMessage) error
	ListMessagesByConversation(ctx context.Context, conversationID uint) ([]model.AIMessage, error)
	ListRecentMessagesByConversation(ctx context.Context, conversationID uint, limit int) ([]model.AIMessage, error)
}

// promptCacheEntry is a cached, workspace-scoped system prompt. The prompt is
// LLM context assembled from several DB queries; a short TTL keeps it fresh
// enough for context while avoiding rebuilding it on every chat message.
type promptCacheEntry struct {
	prompt string
	at     time.Time
}

type AIService struct {
	aiRepo          AIRepository
	contactRepo     ContactRepository
	eventRepo       EventRepository
	interactionRepo InteractionRepository
	transactionRepo TransactionRepository
	relationRepo    RelationRepository
	aiCfg           config.AIConfig
	httpClient      *http.Client
	clientCache     map[string]*llm.Client
	clientMu        sync.RWMutex
	promptCache     map[uint]promptCacheEntry
	promptCacheMu   sync.Mutex
}

func NewAIService(
	aiRepo AIRepository,
	contactRepo ContactRepository,
	eventRepo EventRepository,
	interactionRepo InteractionRepository,
	transactionRepo TransactionRepository,
	relationRepo RelationRepository,
	aiCfg config.AIConfig,
) *AIService {
	return &AIService{
		aiRepo:          aiRepo,
		contactRepo:     contactRepo,
		eventRepo:       eventRepo,
		interactionRepo: interactionRepo,
		transactionRepo: transactionRepo,
		relationRepo:    relationRepo,
		aiCfg:           aiCfg,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		clientCache: make(map[string]*llm.Client),
		promptCache: make(map[uint]promptCacheEntry),
	}
}

// --- Provider management ---

func (s *AIService) ListProviders(ctx context.Context, userID uint) ([]model.AIProvider, error) {
	providers, err := s.aiRepo.ListProviders(ctx, userID)
	if err != nil {
		return nil, err
	}
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

	existing, err := s.aiRepo.GetProviderByType(ctx, userID, providerType)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if existing != nil {
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
	if err == nil {
		return s.cachedClient(provider.BaseURL, provider.APIKey, provider.Model), nil
	}

	// Fallback to config-based provider (from env / config.yaml)
	if s.aiCfg.APIKey != "" && s.aiCfg.BaseURL != "" {
		return s.cachedClient(s.aiCfg.BaseURL, s.aiCfg.APIKey, s.aiCfg.Model), nil
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNoActiveProvider
	}
	return nil, err
}

func (s *AIService) cachedClient(baseURL, apiKey, model string) *llm.Client {
	key := baseURL + "|" + apiKey + "|" + model
	s.clientMu.RLock()
	if c, ok := s.clientCache[key]; ok {
		s.clientMu.RUnlock()
		return c
	}
	s.clientMu.RUnlock()

	s.clientMu.Lock()
	defer s.clientMu.Unlock()
	if c, ok := s.clientCache[key]; ok {
		return c
	}
	c := llm.NewClient(baseURL, apiKey, model, llm.WithHTTPClient(s.httpClient))
	s.clientCache[key] = c
	return c
}

const maxHistoryMessages = 50

func truncateMessages(messages []llm.Message) []llm.Message {
	if len(messages) <= maxHistoryMessages {
		return messages
	}
	return messages[len(messages)-maxHistoryMessages:]
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

func (s *AIService) StreamChat(ctx context.Context, userID, workspaceID, conversationID uint, userMessage string) (<-chan llm.StreamChunk, error) {
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

	if err := s.aiRepo.CreateMessage(ctx, &model.AIMessage{
		ConversationID: conversationID,
		Role:           model.AIMessageUser,
		Content:        userMessage,
	}); err != nil {
		return nil, err
	}

	messages, err := s.aiRepo.ListRecentMessagesByConversation(ctx, conversationID, maxHistoryMessages-1)
	if err != nil {
		return nil, err
	}

	systemPrompt, err := s.buildSystemPrompt(ctx, userID, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("build system prompt: %w", err)
	}

	llmMessages := []llm.Message{{Role: "system", Content: systemPrompt}}
	for _, m := range messages {
		llmMessages = append(llmMessages, llm.Message{Role: string(m.Role), Content: m.Content})
	}
	llmMessages = truncateMessages(llmMessages)

	if conv.Title == "" {
		title := userMessage
		if len(title) > 50 {
			title = title[:50] + "..."
		}
		conv.Title = title
		if err := s.aiRepo.UpdateConversationTitle(ctx, userID, conversationID, title); err != nil {
			return nil, fmt.Errorf("set conversation title: %w", err)
		}
	}

	stream, err := client.StreamChat(ctx, llmMessages)
	if err != nil {
		return nil, err
	}

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
				// Persist with a context detached from the request so a client
				// disconnect after the stream completed doesn't silently drop the
				// reply from history. Bounded so a stuck write can't leak the goroutine.
				persistCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
				if err := s.aiRepo.CreateMessage(persistCtx, &model.AIMessage{
					ConversationID: conversationID,
					Role:           model.AIMessageAssistant,
					Content:        full.String(),
				}); err != nil {
					log.Printf("ai: persist assistant message: %v", err)
				}
				cancel()
				return
			}
			full.WriteString(chunk.Content)
		}
	}()

	return out, nil
}

func (s *AIService) Chat(ctx context.Context, userID, workspaceID, conversationID uint, userMessage string) (string, error) {
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

	if err := s.aiRepo.CreateMessage(ctx, &model.AIMessage{
		ConversationID: conversationID,
		Role:           model.AIMessageUser,
		Content:        userMessage,
	}); err != nil {
		return "", err
	}

	messages, err := s.aiRepo.ListRecentMessagesByConversation(ctx, conversationID, maxHistoryMessages-1)
	if err != nil {
		return "", err
	}

	systemPrompt, err := s.buildSystemPrompt(ctx, userID, workspaceID)
	if err != nil {
		return "", fmt.Errorf("build system prompt: %w", err)
	}

	llmMessages := []llm.Message{{Role: "system", Content: systemPrompt}}
	for _, m := range messages {
		llmMessages = append(llmMessages, llm.Message{Role: string(m.Role), Content: m.Content})
	}
	llmMessages = truncateMessages(llmMessages)

	resp, err := client.Chat(ctx, llmMessages)
	if err != nil {
		return "", err
	}

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

func (s *AIService) AnalyzeRelationship(ctx context.Context, userID, workspaceID, contactID uint) (string, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return "", err
	}

	contact, err := s.contactRepo.GetByID(ctx, workspaceID, contactID)
	if err != nil {
		return "", fmt.Errorf("get contact: %w", err)
	}

	interactions, _, err := s.interactionRepo.ListByContact(ctx, workspaceID, contactID, 1, 20)
	if err != nil {
		return "", fmt.Errorf("get interactions: %w", err)
	}

	relations, err := s.relationRepo.ListByContact(ctx, workspaceID, contactID)
	if err != nil {
		return "", fmt.Errorf("get relations: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("Analyze the following personal relationship and provide insights on relationship quality, communication patterns, and suggestions for improvement.\n\n")
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

func (s *AIService) AnalyzeEvent(ctx context.Context, userID, workspaceID, eventID uint) (string, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return "", err
	}

	event, err := s.eventRepo.GetByID(ctx, workspaceID, eventID)
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
		contacts, err := s.contactRepo.GetByIDs(ctx, workspaceID, event.ContactIDs)
		if err == nil {
			for _, contact := range contacts {
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

// promptCacheTTL bounds how long a cached system prompt is reused.
const promptCacheTTL = 60 * time.Second

// buildSystemPrompt returns a workspace's system prompt, serving a short-TTL
// cache so an active conversation doesn't rebuild it (several queries) on every
// message. The prompt is LLM context, so brief staleness is acceptable.
func (s *AIService) buildSystemPrompt(ctx context.Context, userID, workspaceID uint) (string, error) {
	s.promptCacheMu.Lock()
	if entry, ok := s.promptCache[workspaceID]; ok && time.Since(entry.at) < promptCacheTTL {
		s.promptCacheMu.Unlock()
		return entry.prompt, nil
	}
	s.promptCacheMu.Unlock()

	prompt, err := s.buildSystemPromptUncached(ctx, userID, workspaceID)
	if err != nil {
		return "", err
	}

	s.promptCacheMu.Lock()
	s.promptCache[workspaceID] = promptCacheEntry{prompt: prompt, at: time.Now()}
	s.promptCacheMu.Unlock()
	return prompt, nil
}

func (s *AIService) buildSystemPromptUncached(ctx context.Context, userID, workspaceID uint) (string, error) {
	var sb strings.Builder
	sb.WriteString("You are CuddleGecko AI, a personal CRM assistant. You help the user manage and understand their relationships. Answer questions about their data or provide relationship advice.\n\n")

	// Each section degrades independently: a transient DB failure just omits
	// that section from the prompt (logged), rather than failing the chat turn.
	contacts, _, err := s.contactRepo.List(ctx, workspaceID, 1, 50, "", nil)
	if err != nil {
		log.Printf("ai: system prompt: load contacts (ws %d): %v", workspaceID, err)
	}
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

	events, _, err := s.eventRepo.List(ctx, workspaceID, 1, 10, nil, nil, "")
	if err != nil {
		log.Printf("ai: system prompt: load events (ws %d): %v", workspaceID, err)
	}
	if err == nil && len(events) > 0 {
		sb.WriteString("## Recent Events\n")
		for _, e := range events {
			sb.WriteString(fmt.Sprintf("- %s (%s)\n", e.Title, e.StartTime.Format("2006-01-02")))
		}
		sb.WriteString("\n")
	}

	income, expense, err := s.transactionRepo.Summary(ctx, workspaceID)
	if err != nil {
		log.Printf("ai: system prompt: tx summary (ws %d): %v", workspaceID, err)
	}
	if err == nil {
		sb.WriteString(fmt.Sprintf("## Financial Summary\n- Income: %.2f\n- Expense: %.2f\n- Balance: %.2f\n\n", income, expense, income-expense))
	}

	return sb.String(), nil
}

// --- Comprehensive Analysis ---

type AnalyzeRequest struct {
	Type       string `json:"type"`
	ContactIDs []uint `json:"contact_ids"`
	EventIDs   []uint `json:"event_ids"`
	Question   string `json:"question"`
}

func (s *AIService) AnalyzeComprehensive(ctx context.Context, userID, workspaceID uint, req AnalyzeRequest) (string, error) {
	client, err := s.getActiveClient(ctx, userID)
	if err != nil {
		return "", err
	}

	var sb strings.Builder

	switch req.Type {
	case "contact", "comprehensive":
		s.buildContactAnalysis(ctx, userID, workspaceID, req.ContactIDs, &sb)
	case "event":
		s.buildEventAnalysis(ctx, userID, workspaceID, req.EventIDs, &sb)
	case "financial":
		// financial only below
	}

	if req.Type == "financial" || req.Type == "comprehensive" {
		s.buildFinancialAnalysis(ctx, userID, workspaceID, &sb)
	}

	if req.Question != "" {
		sb.WriteString(fmt.Sprintf("\n## User Question\n%s\n", req.Question))
	}

	if sb.Len() == 0 {
		return "", fmt.Errorf("no data selected for analysis")
	}

	systemPrompt := "You are CuddleGecko AI, a comprehensive personal CRM analyst. Analyze the provided data and give structured, actionable insights. Include relationship quality assessment, patterns, risks, and concrete suggestions. Respond in the user's language (Chinese for zh, English for en). Use markdown formatting."
	switch req.Type {
	case "contact":
		systemPrompt = "You are a personal relationship analyst. Analyze the contacts and their associated data deeply. Cover: relationship health score (1-10), communication frequency, interaction quality, suggestions for improvement, potential risks. Respond in the user's language. Use markdown."
	case "event":
		systemPrompt = "You are a personal event analyst. Analyze the events and provide: importance assessment, preparation suggestions, timeline recommendations, related contact insights. Respond in the user's language. Use markdown."
	case "financial":
		systemPrompt = "You are a personal finance analyst. Analyze the financial data and provide: spending patterns, savings rate, category breakdown, budget recommendations, trends. Respond in the user's language. Use markdown."
	}

	messages := []llm.Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: sb.String()},
	}

	return client.Chat(ctx, messages)
}

func (s *AIService) buildContactAnalysis(ctx context.Context, userID, workspaceID uint, contactIDs []uint, sb *strings.Builder) {
	if len(contactIDs) == 0 {
		return
	}
	sb.WriteString("## Contact Analysis Request\n\n")

	contacts, err := s.contactRepo.GetByIDs(ctx, workspaceID, contactIDs)
	if err != nil {
		return
	}
	contactByID := make(map[uint]*model.Contact, len(contacts))
	for i := range contacts {
		contactByID[contacts[i].ID] = &contacts[i]
	}

	interactions, err := s.interactionRepo.ListByContactIDs(ctx, workspaceID, contactIDs, 20*len(contactIDs))
	if err != nil {
		interactions = nil
	}
	interactionsByContact := make(map[uint][]model.Interaction)
	for _, i := range interactions {
		interactionsByContact[i.ContactID] = append(interactionsByContact[i.ContactID], i)
	}

	relations, err := s.relationRepo.ListByContactIDs(ctx, workspaceID, contactIDs)
	if err != nil {
		relations = nil
	}
	relationsByContact := make(map[uint][]model.ContactRelation)
	for _, r := range relations {
		relationsByContact[r.ContactIDA] = append(relationsByContact[r.ContactIDA], r)
		relationsByContact[r.ContactIDB] = append(relationsByContact[r.ContactIDB], r)
	}

	txs, err := s.transactionRepo.ListByContactIDs(ctx, workspaceID, contactIDs, 20*len(contactIDs))
	if err != nil {
		txs = nil
	}
	txsByContact := make(map[uint][]model.Transaction)
	for _, tx := range txs {
		for _, cid := range tx.ContactIDs {
			txsByContact[cid] = append(txsByContact[cid], tx)
		}
	}

	for _, cid := range contactIDs {
		contact, ok := contactByID[cid]
		if !ok {
			continue
		}

		sb.WriteString(fmt.Sprintf("### Contact: %s\n", contact.Name))
		if len(contact.RelationshipLabels) > 0 {
			sb.WriteString(fmt.Sprintf("- Labels: %s\n", strings.Join(contact.RelationshipLabels, ", ")))
		}
		if contact.Notes != "" {
			sb.WriteString(fmt.Sprintf("- Notes: %s\n", contact.Notes))
		}

		cInteractions := interactionsByContact[cid]
		if len(cInteractions) > 0 {
			sb.WriteString("- Interactions:\n")
			for _, i := range cInteractions {
				sb.WriteString(fmt.Sprintf("  - [%s] %s (%s): %s\n", i.Type, i.Title, i.OccurredAt.Format("2006-01-02"), truncate(i.Content, 100)))
			}
		}

		cRelations := relationsByContact[cid]
		if len(cRelations) > 0 {
			sb.WriteString("- Relations:\n")
			for _, r := range cRelations {
				sb.WriteString(fmt.Sprintf("  - %s\n", r.RelationType))
			}
		}

		cTxs := txsByContact[cid]
		if len(cTxs) > 0 {
			sb.WriteString("- Financial transactions:\n")
			for _, tx := range cTxs {
				sb.WriteString(fmt.Sprintf("  - [%s] %s: %.2f (%s)\n", tx.Type, tx.Title, tx.Amount, tx.Date.Format("2006-01-02")))
			}
		}

		sb.WriteString("\n")
	}
}

func (s *AIService) buildEventAnalysis(ctx context.Context, userID, workspaceID uint, eventIDs []uint, sb *strings.Builder) {
	if len(eventIDs) == 0 {
		return
	}
	sb.WriteString("## Event Analysis Request\n\n")

	events, err := s.eventRepo.GetByIDs(ctx, workspaceID, eventIDs)
	if err != nil {
		return
	}

	allContactIDs := make([]uint, 0, 64)
	seenContact := make(map[uint]struct{})
	for _, event := range events {
		for _, cid := range event.ContactIDs {
			if _, ok := seenContact[cid]; !ok {
				seenContact[cid] = struct{}{}
				allContactIDs = append(allContactIDs, cid)
			}
		}
	}

	contacts, err := s.contactRepo.GetByIDs(ctx, workspaceID, allContactIDs)
	if err != nil {
		contacts = nil
	}
	contactByID := make(map[uint]*model.Contact, len(contacts))
	for i := range contacts {
		contactByID[contacts[i].ID] = &contacts[i]
	}

	for _, event := range events {
		sb.WriteString(fmt.Sprintf("### Event: %s\n", event.Title))
		if event.Description != "" {
			sb.WriteString(fmt.Sprintf("- Description: %s\n", event.Description))
		}
		sb.WriteString(fmt.Sprintf("- Time: %s", event.StartTime.Format("2006-01-02 15:04")))
		if event.EndTime != nil {
			sb.WriteString(fmt.Sprintf(" - %s", event.EndTime.Format("2006-01-02 15:04")))
		}
		sb.WriteString("\n")
		if event.Location != "" {
			sb.WriteString(fmt.Sprintf("- Location: %s\n", event.Location))
		}

		if len(event.ContactIDs) > 0 {
			sb.WriteString("- Participants:\n")
			for _, cid := range event.ContactIDs {
				contact, ok := contactByID[cid]
				if !ok {
					continue
				}
				labels := strings.Join(contact.RelationshipLabels, ", ")
				sb.WriteString(fmt.Sprintf("  - %s", contact.Name))
				if labels != "" {
					sb.WriteString(fmt.Sprintf(" (%s)", labels))
				}
				sb.WriteString("\n")
			}
		}

		sb.WriteString("\n")
	}
}

func (s *AIService) buildFinancialAnalysis(ctx context.Context, userID, workspaceID uint, sb *strings.Builder) {
	income, expense, err := s.transactionRepo.Summary(ctx, workspaceID)
	if err != nil {
		return
	}

	sb.WriteString("## Financial Analysis Request\n\n")
	sb.WriteString(fmt.Sprintf("- Total Income: %.2f\n", income))
	sb.WriteString(fmt.Sprintf("- Total Expense: %.2f\n", expense))
	sb.WriteString(fmt.Sprintf("- Balance: %.2f\n\n", income-expense))

	txs, _, err := s.transactionRepo.List(ctx, workspaceID, 1, 30, nil, nil, "")
	if err == nil && len(txs) > 0 {
		sb.WriteString("### Recent Transactions\n")
		for _, tx := range txs {
			cat := tx.Category
			if cat == "" {
				cat = "uncategorized"
			}
			sb.WriteString(fmt.Sprintf("- [%s] %s: %.2f (%s, %s)\n",
				tx.Type, tx.Title, tx.Amount, tx.Date.Format("2006-01-02"), cat))
		}
		sb.WriteString("\n")
	}
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
