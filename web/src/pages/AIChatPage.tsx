import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import type { AIConversation, AIMessage, Contact, Event, Tag } from '../types'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import AvatarDisplay from '../components/AvatarDisplay'
import { Send, Plus, Trash2, Bot, Users, Calendar, Wallet, Sparkles, Loader2, X, Tag as TagIcon, MessageSquare } from 'lucide-react'

type MentionTab = 'contact' | 'event' | 'tag'

interface MentionItem {
  type: 'contact' | 'event' | 'tag' | 'finance'
  id: number
  name: string
  avatar_emoji?: string
  avatar_url?: string
  color?: string
}

const TAB_ICONS: Record<MentionTab, typeof Users> = { contact: Users, event: Calendar, tag: TagIcon }
const TAB_KEYS: MentionTab[] = ['contact', 'event', 'tag']
const TAB_I18N: Record<MentionTab, string> = { contact: 'contactsTab', event: 'eventsTab', tag: 'tagTab' }

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
  const inputRef = useRef<HTMLInputElement>(null)
  const isWails = typeof window !== 'undefined' && !!(window as any).__WAILS__

  // @ mention state
  const [mentions, setMentions] = useState<MentionItem[]>([])
  const [mentionPopup, setMentionPopup] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionTab, setMentionTab] = useState<MentionTab>('contact')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const mentionRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    if (!adapters?.ai) return
    try {
      const res = await adapters.ai.listConversations({ page: 1, page_size: 50 })
      setConversations(res.items || [])
    } catch {}
  }, [adapters?.ai])

  useEffect(() => {
    if (!adapters) return
    adapters.contact.list({ page: 1, page_size: 200 }).then((res: { items: Contact[] }) => setContacts(res.items || []))
    adapters.event.list({ page: 1, page_size: 100 }).then((res: { items: Event[] }) => setEvents(res.items || []))
    adapters.tag.list().then((res: Tag[]) => setTags(Array.isArray(res) ? res : []))
  }, [adapters])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Close mention popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setMentionPopup(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
      if (activeConvId === id) { setActiveConvId(null); setMessages([]) }
      loadConversations()
    } catch {}
  }

  const ensureConversation = async (): Promise<number> => {
    let convId = activeConvId
    if (!convId) {
      const conv = await adapters!.ai.createConversation({})
      convId = conv.id
      setActiveConvId(convId)
      loadConversations()
    }
    return convId
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)

    const lastAt = val.lastIndexOf('@')
    if (lastAt !== -1 && (lastAt === 0 || val[lastAt - 1] === ' ')) {
      const after = val.slice(lastAt + 1)
      if (!after.includes(' ')) {
        setMentionFilter(after)
        setMentionPopup(true)
        return
      }
    }
    setMentionPopup(false)
  }

  const handleSelectMention = (item: MentionItem) => {
    if (!mentions.some((m) => m.type === item.type && m.id === item.id)) {
      setMentions((prev) => [...prev, item])
    }
    const lastAt = input.lastIndexOf('@')
    if (lastAt !== -1) {
      setInput(input.slice(0, lastAt))
    }
    setMentionPopup(false)
    inputRef.current?.focus()
  }

  const removeMention = (item: MentionItem) => {
    setMentions((prev) => prev.filter((m) => !(m.type === item.type && m.id === item.id)))
  }

  const resolveContactIds = (): number[] => {
    const ids = new Set<number>()
    mentions.forEach((m) => {
      if (m.type === 'contact') ids.add(m.id)
      if (m.type === 'tag') {
        contacts.forEach((c) => {
          if (c.tags?.some((t) => t.id === m.id)) ids.add(c.id)
        })
      }
    })
    return [...ids]
  }

  const handleSend = async () => {
    if (!adapters?.ai || streaming || analyzing) return
    const text = input.trim()

    if (mentions.length > 0) {
      await handleAnalysis(text)
      return
    }

    if (!text) return
    setInput('')

    const convId = await ensureConversation()
    const userMsg: AIMessage = { id: Date.now(), conversation_id: convId, role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setStreaming(true)
    setStreamContent('')

    try {
      if (isWails) {
        const result = await adapters.ai.chat(convId, text)
        setMessages((prev) => [...prev, { id: Date.now() + 1, conversation_id: convId!, role: 'assistant', content: result, created_at: new Date().toISOString() }])
      } else {
        const token = localStorage.getItem('access_token')
        const resp = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversation_id: convId, message: text }),
        })
        if (!resp.ok || !resp.body) throw new Error('Failed')
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              if (data.startsWith('{') && data.includes('"error"')) continue
              fullContent += data
              setStreamContent(fullContent)
            }
          }
        }
        setMessages((prev) => [...prev, { id: Date.now() + 1, conversation_id: convId!, role: 'assistant', content: fullContent, created_at: new Date().toISOString() }])
      }
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, conversation_id: convId!, role: 'assistant', content: t('ai.sendFailed'), created_at: new Date().toISOString() }])
    } finally {
      setStreaming(false)
      setStreamContent('')
      loadConversations()
    }
  }

  const handleAnalysis = async (question: string) => {
    if (!adapters?.ai || analyzing) return
    const contactIds = resolveContactIds()
    const eventIds = mentions.filter((m) => m.type === 'event').map((m) => m.id)
    const hasFinance = mentions.some((m) => m.type === 'finance')

    const analysisType = (contactIds.length > 0 || eventIds.length > 0) && hasFinance ? 'comprehensive'
      : contactIds.length > 0 || eventIds.length > 0 ? 'contact'
      : hasFinance ? 'financial'
      : 'contact'

    const label = mentions.map((m) => m.name).join(', ')
    const convId = await ensureConversation()
    setMentions([])
    setInput('')

    setMessages((prev) => [...prev,
      { id: Date.now(), conversation_id: convId, role: 'user', content: question || `${t('ai.comprehensiveAnalysis')}: ${label}`, created_at: new Date().toISOString() },
    ])
    setAnalyzing(true)

    try {
      const result = await adapters.ai.analyzeComprehensive({
        type: analysisType,
        contact_ids: contactIds.length > 0 ? contactIds : undefined,
        event_ids: eventIds.length > 0 ? eventIds : undefined,
        question: question || undefined,
      })
      setMessages((prev) => [...prev, { id: Date.now() + 1, conversation_id: convId, role: 'assistant', content: result.analysis, created_at: new Date().toISOString() }])
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, conversation_id: convId, role: 'assistant', content: t('ai.sendFailed'), created_at: new Date().toISOString() }])
    } finally {
      setAnalyzing(false)
      loadConversations()
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  // Filtered items per tab
  const filter = mentionFilter.toLowerCase()
  const filteredContacts = contacts
    .filter((c) => c.name.toLowerCase().includes(filter))
    .filter((c) => !mentions.some((m) => m.type === 'contact' && m.id === c.id))
    .slice(0, 8)

  const filteredEvents = events
    .filter((e) => e.title.toLowerCase().includes(filter))
    .filter((e) => !mentions.some((m) => m.type === 'event' && m.id === e.id))
    .slice(0, 8)

  const filteredTags = tags
    .filter((tg) => tg.name.toLowerCase().includes(filter))
    .filter((tg) => !mentions.some((m) => m.type === 'tag' && m.id === tg.id))
    .slice(0, 8)

  const hasActiveConv = activeConvId !== null || messages.length > 0

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation sidebar */}
      <div className="w-56 shrink-0 flex flex-col border-r bg-card">
        <div className="p-3 border-b">
          <Button onClick={handleNewChat} className="w-full justify-center gap-2" size="sm">
            <Plus className="h-3.5 w-3.5" /> {t('ai.newChat')}
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-all duration-150 ${
                activeConvId === conv.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              onClick={() => loadMessages(conv.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate text-xs">{conv.title || t('ai.newChat')}</span>
              <button
                className={`shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive ${
                  activeConvId === conv.id ? 'opacity-100' : ''
                }`}
                onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id) }}
                aria-label={t('ai.deleteChat')}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">{t('ai.noConversations')}</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Messages */}
        <div className="flex-1 overflow-auto">
          {!hasActiveConv ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <div className="rounded-2xl bg-primary/10 p-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center space-y-1.5">
                <h2 className="text-lg font-semibold">{t('ai.title')}</h2>
                <p className="text-sm text-muted-foreground max-w-sm">{t('ai.placeholder')}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {messages
                .filter((m) => m.role !== 'system')
                .map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md'
                    }`}>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))}
              {analyzing && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('ai.analyzing')}
                  </div>
                </div>
              )}
              {streaming && streamContent && (
                <div className="flex justify-start">
                  <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm">
                    <div className="whitespace-pre-wrap">{streamContent}</div>
                  </div>
                </div>
              )}
              {streaming && !streamContent && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {t('ai.thinking')}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Mention badges + quick actions + input — always visible */}
        <div className="border-t">
          {mentions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2.5 pb-1.5">
              {mentions.map((m) => (
                <Badge key={`${m.type}-${m.id}`} variant="secondary" className="gap-1 pr-1 h-6 text-xs">
                  {m.type === 'contact' ? (
                    <AvatarDisplay emoji={m.avatar_emoji} imageUrl={m.avatar_url} name={m.name} size="sm" />
                  ) : m.type === 'event' ? (
                    <Calendar className="h-3 w-3" />
                  ) : m.type === 'tag' ? (
                    <TagIcon className="h-3 w-3" />
                  ) : (
                    <Wallet className="h-3 w-3" />
                  )}
                  <span>{m.name}</span>
                  <button type="button" onClick={() => removeMention(m)} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-primary font-medium" onClick={() => handleAnalysis('')} disabled={analyzing}>
                <Sparkles className="h-3 w-3" />
                {t('ai.comprehensiveAnalysis')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 px-4 pt-2 pb-1.5">
              {(['contact', 'event', 'tag'] as const).map((tab) => {
                const Icon = TAB_ICONS[tab]
                return (
                  <button
                    key={tab}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    onClick={() => { setMentionTab(tab); inputRef.current?.focus(); setInput('@'); setMentionPopup(true); setMentionFilter('') }}
                  >
                    <Icon className="h-3 w-3" />
                    @{t(`ai.${TAB_I18N[tab]}`)}
                  </button>
                )
              })}
              <button
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={() => { setMentions((prev) => [...prev, { type: 'finance', id: 0, name: t('ai.financialInsight') }]); inputRef.current?.focus() }}
              >
                <Wallet className="h-3 w-3" />
                {t('ai.financialInsight')}
              </button>
            </div>
          )}

          {/* Input + mention popup */}
          <div className="relative px-3 pb-3" ref={mentionRef}>
            {/* @ mention popup */}
            {mentionPopup && (
              <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border bg-popover shadow-lg z-50 overflow-hidden">
                <div className="flex border-b bg-muted/30">
                  {TAB_KEYS.map((tab) => {
                    const Icon = TAB_ICONS[tab]
                    return (
                      <button
                        key={tab}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                          mentionTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setMentionTab(tab)}
                      >
                        <Icon className="mr-1 inline h-3 w-3" />{t(`ai.${TAB_I18N[tab]}`)}
                      </button>
                    )
                  })}
                </div>
                <div className="max-h-52 overflow-auto p-1">
                  {mentionTab === 'contact' ? (
                    filteredContacts.length > 0 ? filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => handleSelectMention({ type: 'contact', id: c.id, name: c.name, avatar_emoji: c.avatar_emoji, avatar_url: c.avatar_url })}
                      >
                        <AvatarDisplay emoji={c.avatar_emoji} imageUrl={c.avatar_url} name={c.name} size="sm" />
                        <span className="truncate">{c.name}</span>
                      </button>
                    )) : (
                      <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">{t('contacts.noContacts')}</p>
                    )
                  ) : mentionTab === 'event' ? (
                    filteredEvents.length > 0 ? filteredEvents.map((e) => (
                      <button
                        key={e.id}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => handleSelectMention({ type: 'event', id: e.id, name: e.title, color: e.color })}
                      >
                        {e.color && <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />}
                        <span className="truncate flex-1">{e.title}</span>
                        <span className="shrink-0 text-muted-foreground">{new Date(e.start_time).toLocaleDateString()}</span>
                      </button>
                    )) : (
                      <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">{t('events.noEvents')}</p>
                    )
                  ) : (
                    filteredTags.length > 0 ? filteredTags.map((tg) => (
                      <button
                        key={tg.id}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => handleSelectMention({ type: 'tag', id: tg.id, name: tg.name, color: tg.color })}
                      >
                        <div className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: tg.color }} />
                        <span className="truncate">{tg.name}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {contacts.filter((c) => c.tags?.some((ct) => ct.id === tg.id)).length}
                        </span>
                      </button>
                    )) : (
                      <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">{t('tags.noTags')}</p>
                    )
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={inputRef}
                className="flex-1 rounded-xl border bg-muted/50 px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring transition-colors outline-none"
                aria-label={t('ai.placeholder')}
                placeholder={t('ai.placeholder')}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                disabled={streaming || analyzing}
              />
              <Button onClick={handleSend} disabled={streaming || analyzing || (!input.trim() && mentions.length === 0)} size="icon" className="shrink-0 rounded-xl h-10 w-10">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
