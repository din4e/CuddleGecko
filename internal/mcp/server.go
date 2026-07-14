package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/din4e/cuddlegecko/internal/service"
)

// ToolHandler is a function that handles an MCP tool call.
type ToolHandler func(ctx context.Context, userID, workspaceID uint, args map[string]interface{}) (interface{}, error)

type toolDef struct {
	name        string
	description string
	inputSchema map[string]interface{}
	handler     ToolHandler
}

// MCPServer holds all service references and registered tools.
type MCPServer struct {
	contactSvc     *service.ContactService
	tagSvc         *service.TagService
	interactionSvc *service.InteractionService
	reminderSvc    *service.ReminderService
	relationSvc    *service.RelationService
	eventSvc       *service.EventService
	todoSvc        *service.TodoService
	todoListSvc    *service.TodoListService
	todoItemSvc    *service.TodoItemService
	transactionSvc *service.TransactionService
	aiSvc          *service.AIService
	workspaceSvc   *service.WorkspaceService

	tools    map[string]toolDef
	toolList []Tool
}

// NewServer creates a new MCPServer and registers all tools.
func NewServer(
	contactSvc *service.ContactService,
	tagSvc *service.TagService,
	interactionSvc *service.InteractionService,
	reminderSvc *service.ReminderService,
	relationSvc *service.RelationService,
	eventSvc *service.EventService,
	todoSvc *service.TodoService,
	todoListSvc *service.TodoListService,
	todoItemSvc *service.TodoItemService,
	transactionSvc *service.TransactionService,
	aiSvc *service.AIService,
	workspaceSvc *service.WorkspaceService,
) *MCPServer {
	s := &MCPServer{
		contactSvc:     contactSvc,
		tagSvc:         tagSvc,
		interactionSvc: interactionSvc,
		reminderSvc:    reminderSvc,
		relationSvc:    relationSvc,
		eventSvc:       eventSvc,
		todoSvc:        todoSvc,
		todoListSvc:    todoListSvc,
		todoItemSvc:    todoItemSvc,
		transactionSvc: transactionSvc,
		aiSvc:          aiSvc,
		workspaceSvc:   workspaceSvc,
		tools:          make(map[string]toolDef),
	}

	s.registerBuddyTools()
	s.registerEventTools()
	s.registerTodoTools()
	s.registerTodoListTools()
	s.registerTodoItemTools()
	s.registerTagTools()
	s.registerTransactionTools()
	s.registerInteractionTools()
	s.registerReminderTools()
	s.registerGraphTools()
	s.registerAITools()
	s.registerWorkspaceTools()

	return s
}

func (s *MCPServer) registerTool(name, description string, inputSchema map[string]interface{}, handler ToolHandler) {
	td := toolDef{
		name:        name,
		description: description,
		inputSchema: inputSchema,
		handler:     handler,
	}
	s.tools[name] = td
	s.toolList = append(s.toolList, Tool{
		Name:        name,
		Description: description,
		InputSchema: inputSchema,
	})
}

// HandleMethod dispatches a JSON-RPC method to the appropriate handler.
func (s *MCPServer) HandleMethod(method string, params json.RawMessage, userID, workspaceID uint) JSONRPCResponse {
	switch method {
	case "initialize":
		return JSONRPCResponse{
			JSONRPC: "2.0",
			Result: map[string]interface{}{
				"protocolVersion": "2025-11-25",
				"capabilities":    map[string]interface{}{"tools": map[string]interface{}{}},
				"serverInfo":      map[string]interface{}{"name": "cuddlegecko", "version": "1.0.0"},
			},
		}

	case "notifications/initialized":
		return JSONRPCResponse{JSONRPC: "2.0"}

	case "tools/list":
		return JSONRPCResponse{
			JSONRPC: "2.0",
			Result:  map[string]interface{}{"tools": s.toolList},
		}

	case "tools/call":
		var p CallToolParams
		if err := json.Unmarshal(params, &p); err != nil {
			return JSONRPCResponse{
				JSONRPC: "2.0",
				Error:   &JSONRPCError{Code: InvalidParams, Message: fmt.Sprintf("invalid params: %v", err)},
			}
		}
		td, ok := s.tools[p.Name]
		if !ok {
			return JSONRPCResponse{
				JSONRPC: "2.0",
				Error:   &JSONRPCError{Code: InvalidParams, Message: fmt.Sprintf("unknown tool: %s", p.Name)},
			}
		}

		result, err := td.handler(context.Background(), userID, workspaceID, p.Arguments)
		if err != nil {
			errJSON, _ := json.Marshal(err.Error())
			return JSONRPCResponse{
				JSONRPC: "2.0",
				Result: CallToolResult{
					Content: []TextContent{{Type: "text", Text: string(errJSON)}},
					IsError: true,
				},
			}
		}

		resultJSON, err := json.Marshal(result)
		if err != nil {
			return JSONRPCResponse{
				JSONRPC: "2.0",
				Error:   &JSONRPCError{Code: InternalError, Message: fmt.Sprintf("marshal result: %v", err)},
			}
		}

		return JSONRPCResponse{
			JSONRPC: "2.0",
			Result: CallToolResult{
				Content: []TextContent{{Type: "text", Text: string(resultJSON)}},
			},
		}

	default:
		return JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: MethodNotFound, Message: fmt.Sprintf("method not found: %s", method)},
		}
	}
}
