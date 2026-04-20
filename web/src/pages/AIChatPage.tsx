import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import type { AIConversation, AIMessage } from '../types'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Send, Plus, Trash2, Bot } from 'lucide-react'

export default function AIChatPage() {
  const { t } = useTranslation()
  const adapters = useModeStore((s) => s.adapters)
  const [conversations, setConversations] = useState<AIConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isWails = typeof window !== 'undefined' && !!(window as any).__WAILS__

  const loadConversations = useCallback(async () => {
    if (!adapters?.ai) return
    try {
      const res = await adapters.ai.listConversations({ page: 1, page_size: 50 })
      setConversations(res.items || [])
    } catch {}
  }, [adapters?.ai])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const loadMessages = useCallback(async (convId: number) => {
    if (!adapters?.ai) return
    try {
      const msgs = await adapters.ai.getMessages(convId)
      setMessages(msgs || [])
      setActiveConvId(convId)
    } catch {}
  }, [adapters?.ai])

  const handleNewChat = async () => {
    if (!adapters?.ai) return
    try {
      const conv = await adapters.ai.createConversation({})
      setActiveConvId(conv.id)
      setMessages([])
      loadConversations()
    } catch {}
  }

  const handleDeleteConv = async (id: number) => {
    if (!adapters?.ai || !confirm(t('ai.deleteChatConfirm'))) return
    try {
      await adapters.ai.deleteConversation(id)
      if (activeConvId === id) {
        setActiveConvId(null)
        setMessages([])
      }
      loadConversations()
    } catch {}
  }

  const handleSend = async () => {
    if (!adapters?.ai || !input.trim() || streaming) return
    const msg = input.trim()
    setInput('')

    let convId = activeConvId
    if (!convId) {
      const conv = await adapters.ai.createConversation({})
      convId = conv.id
      setActiveConvId(convId)
      loadConversations()
    }

    // Add user message optimistically
    const userMsg: AIMessage = {
      id: Date.now(),
      conversation_id: convId,
      role: 'user',
      content: msg,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setStreaming(true)
    setStreamContent('')

    try {
      if (isWails) {
        // Desktop: synchronous call via adapter
        const result = await adapters.ai.chat(convId, msg)
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, conversation_id: convId!, role: 'assistant', content: result, created_at: new Date().toISOString() },
        ])
      } else {
        // Web: SSE streaming via fetch
        const token = localStorage.getItem('access_token')
        const resp = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ conversation_id: convId, message: msg }),
        })

        if (!resp.ok || !resp.body) throw new Error('Failed to send message')

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              if (data.startsWith('{') && data.includes('"error"')) continue
              fullContent += data
              setStreamContent(fullContent)
            }
          }
        }

        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, conversation_id: convId!, role: 'assistant', content: fullContent, created_at: new Date().toISOString() },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, conversation_id: convId!, role: 'assistant', content: t('ai.sendFailed'), created_at: new Date().toISOString() },
      ])
    } finally {
      setStreaming(false)
      setStreamContent('')
      loadConversations()
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  return (
    <div className="flex gap-4 flex-1 min-h-0">
      {/* Conversation list */}
      <div className="w-64 shrink-0 flex flex-col gap-2">
        <Button onClick={handleNewChat} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> {t('ai.newChat')}
        </Button>
        <div className="flex-1 overflow-auto space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors ${
                activeConvId === conv.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
              onClick={() => loadMessages(conv.id)}
            >
              <Bot className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{conv.title || t('ai.newChat')}</span>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 shrink-0 ${activeConvId === conv.id ? 'text-primary-foreground hover:text-primary-foreground' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id) }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('ai.noConversations')}</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col">
        <CardContent className="flex-1 flex flex-col p-0">
          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {!activeConvId && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Bot className="h-8 w-8 mr-2" /> {t('ai.title')}
              </div>
            )}
            {messages
              .filter((m) => m.role !== 'system')
              .map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ))}
            {streaming && streamContent && (
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-lg px-3 py-2 text-sm bg-muted">
                  <div className="whitespace-pre-wrap">{streamContent}</div>
                </div>
              </div>
            )}
            {streaming && !streamContent && (
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground">
                  {t('ai.thinking')}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <input
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={t('ai.placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={streaming}
            />
            <Button onClick={handleSend} disabled={streaming || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
