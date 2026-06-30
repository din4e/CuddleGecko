import { useEffect, useState, useRef, useCallback, useMemo, useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import { nextMessageId } from '../lib/id'
import type { AIConversation, AIMessage, Contact, Event, Tag } from '../types'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import AvatarDisplay from '../components/AvatarDisplay'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Markdown } from '../components/Markdown'
import {
  Send,
  Plus,
  Trash2,
  Bot,
  Users,
  Calendar,
  Wallet,
  Sparkles,
  Loader2,
  X,
  Tag as TagIcon,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'

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
  const [mentions, setMentions] = useState<MentionItem[]>([])
  const [mentionPopup, setMentionPopup] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionTab, setMentionTab] = useState<MentionTab>('contact')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mentionRef = useRef<HTMLDivElement>(null)
  const mentionDataLoadedRef = useRef(false)

  const createLocalMessage = useCallback((conversationId: number, role: AIMessage['role'], content: string): AIMessage => ({
    id: nextMessageId(),
    conversation_id: conversationId,
    role,
    content,
    created_at: new Date().toISOString(),
  }), [])

  const loadConversations = useCallback(async () => {
    if (!adapters?.ai) return
    try {
      const res = await adapters.ai.listConversations({ page: 1, page_size: 50 })
      setConversations(res.items || [])
    } catch {
      /* ignore */
    }
  }, [adapters])

  const loadMentionData = useCallback(async () => {
    if (!adapters || mentionDataLoadedRef.current) return
    mentionDataLoadedRef.current = true
    try {
      const [c, e, tg] = await Promise.all([
        adapters.contact.list({ page: 1, page_size: 200 }),
        adapters.event.list({ page: 1, page_size: 100 }),
        adapters.tag.list(),
      ])
      setContacts((c as { items: Contact[] }).items || [])
      setEvents((e as { items: Event[] }).items || [])
      setTags(Array.isArray(tg) ? tg : [])
    } catch {
      mentionDataLoadedRef.current = false
    }
  }, [adapters])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

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
    } catch {
      /* ignore */
    }
  }, [adapters])

  const handleNewChat = async () => {
    if (!adapters?.ai) return
    try {
      const conv = await adapters.ai.createConversation({})
      setActiveConvId(conv.id)
      setMessages([])
      loadConversations()
    } catch {
      /* ignore */
    }
  }

  const handleDeleteConv = async (id: number) => {
    if (!adapters?.ai) return
    try {
      await adapters.ai.deleteConversation(id)
      if (activeConvId === id) {
        setActiveConvId(null)
        setMessages([])
      }
      setDeleteTarget(null)
      loadConversations()
    } catch {
      /* ignore */
    }
  }

  const ensureConversation = async (): Promise<number> => {
    if (!adapters?.ai) throw new Error('AI adapter not ready')
    if (activeConvId) return activeConvId
    const conv = await adapters.ai.createConversation({})
    setActiveConvId(conv.id)
    loadConversations()
    return conv.id
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
        void loadMentionData()
        return
      }
    }
    setMentionPopup(false)
  }

  const triggerMention = (tab: MentionTab) => {
    setMentionTab(tab)
    setMentionPopup(true)
    setMentionFilter('')
    setInput((prev) => {
      const cleaned = prev.replace(/@[^@\s]*$/, '').trimEnd()
      return cleaned ? `${cleaned} @` : '@'
    })
    void loadMentionData()
    inputRef.current?.focus()
  }

  const handleSelectMention = (item: MentionItem) => {
    if (!mentions.some((m) => m.type === item.type && m.id === item.id)) {
      setMentions((prev) => [...prev, item])
    }
    const lastAt = input.lastIndexOf('@')
    if (lastAt !== -1) {
      setInput(input.slice(0, lastAt))
    }
    setMentionFilter('')
    inputRef.current?.focus()
  }

  const removeMention = (item: MentionItem) => {
    setMentions((prev) => prev.filter((m) => !(m.type === item.type && m.id === item.id)))
  }

  const addFinanceMention = useCallback(() => {
    setMentions((prev) => (
      prev.some((m) => m.type === 'finance')
        ? prev
        : [...prev, { type: 'finance', id: 0, name: t('ai.financialInsight') }]
    ))
    inputRef.current?.focus()
  }, [t])

  const resolveContactIds = (): number[] => {
    const ids = new Set<number>()
    mentions.forEach((m) => {
      if (m.type === 'contact') ids.add(m.id)
      if (m.type === 'tag') {
        contacts.forEach((c) => {
          if (c.tags?.some((tag) => tag.id === m.id)) ids.add(c.id)
        })
      }
    })
    return [...ids]
  }

  const handleAnalysis = async (question: string) => {
    if (!adapters?.ai || analyzing) return
    const contactIds = resolveContactIds()
    const eventIds = mentions.filter((m) => m.type === 'event').map((m) => m.id)
    const hasFinance = mentions.some((m) => m.type === 'finance')

    const analysisType = (contactIds.length > 0 || eventIds.length > 0) && hasFinance
      ? 'comprehensive'
      : contactIds.length > 0 || eventIds.length > 0
        ? 'contact'
        : hasFinance
          ? 'financial'
          : 'contact'

    const label = mentions.map((m) => m.name).join(', ')
    const convId = await ensureConversation()
    setMentions([])
    setInput('')
    setMessages((prev) => [
      ...prev,
      createLocalMessage(convId, 'user', question || `${t('ai.comprehensiveAnalysis')}: ${label}`),
    ])
    setAnalyzing(true)

    try {
      const result = await adapters.ai.analyzeComprehensive({
        type: analysisType,
        contact_ids: contactIds.length > 0 ? contactIds : undefined,
        event_ids: eventIds.length > 0 ? eventIds : undefined,
        question: question || undefined,
      })
      setMessages((prev) => [...prev, createLocalMessage(convId, 'assistant', result.analysis)])
    } catch {
      setMessages((prev) => [...prev, createLocalMessage(convId, 'assistant', t('ai.sendFailed'))])
    } finally {
      setAnalyzing(false)
      loadConversations()
    }
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
    setMessages((prev) => [...prev, createLocalMessage(convId, 'user', text)])
    setStreaming(true)
    setStreamContent('')

    try {
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
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') continue
            if (data.startsWith('{') && data.includes('"error"')) continue
            fullContent += data
            setStreamContent(fullContent)
          }
        }

        setMessages((prev) => [...prev, createLocalMessage(convId, 'assistant', fullContent)])
    } catch {
      setMessages((prev) => [...prev, createLocalMessage(convId, 'assistant', t('ai.sendFailed'))])
    } finally {
      setStreaming(false)
      setStreamContent('')
      loadConversations()
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  const filter = useDeferredValue(mentionFilter).toLowerCase()

  const filteredContacts = useMemo(() => {
    const mentionContactIds = new Set(mentions.filter((m) => m.type === 'contact').map((m) => m.id))
    const out: Contact[] = []
    for (const contact of contacts) {
      if (out.length >= 8) break
      if (mentionContactIds.has(contact.id)) continue
      if (filter && !contact.name.toLowerCase().includes(filter)) continue
      out.push(contact)
    }
    return out
  }, [contacts, filter, mentions])

  const filteredEvents = useMemo(() => {
    const mentionEventIds = new Set(mentions.filter((m) => m.type === 'event').map((m) => m.id))
    const out: Event[] = []
    for (const event of events) {
      if (out.length >= 8) break
      if (mentionEventIds.has(event.id)) continue
      if (filter && !event.title.toLowerCase().includes(filter)) continue
      out.push(event)
    }
    return out
  }, [events, filter, mentions])

  const filteredTags = useMemo(() => {
    const mentionTagIds = new Set(mentions.filter((m) => m.type === 'tag').map((m) => m.id))
    const out: Tag[] = []
    for (const tag of tags) {
      if (out.length >= 8) break
      if (mentionTagIds.has(tag.id)) continue
      if (filter && !tag.name.toLowerCase().includes(filter)) continue
      out.push(tag)
    }
    return out
  }, [tags, filter, mentions])

  const hasActiveConv = activeConvId !== null || messages.length > 0

  return (
    <div className="flex flex-1 min-h-0">
      <div className={`shrink-0 flex flex-col bg-card transition-[width] duration-200 ease-out ${sidebarCollapsed ? 'w-12' : 'w-52'}`}>
        <div className={`flex items-center gap-1 border-b ${sidebarCollapsed ? 'justify-center px-1 py-1.5' : 'px-2 py-2'}`}>
          {!sidebarCollapsed && (
            <Button onClick={handleNewChat} className="flex-1 justify-center gap-1.5 h-7 text-xs" size="sm">
              <Plus className="h-3 w-3" /> {t('ai.newChat')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? t('nav.sidebarExpand') : t('nav.sidebarCollapse')}
          >
            {sidebarCollapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {!sidebarCollapsed ? (
          <div className="flex-1 overflow-auto p-1 space-y-px">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-all duration-150 ${
                  activeConvId === conv.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => loadMessages(conv.id)}
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                <span className="flex-1 truncate text-xs">{conv.title || t('ai.newChat')}</span>
                <button
                  type="button"
                  className={`shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive ${
                    activeConvId === conv.id ? 'opacity-100' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(conv.id)
                  }}
                  aria-label={t('ai.deleteChat')}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">{t('ai.noConversations')}</p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-1 space-y-px">
            <button
              type="button"
              className="flex w-full items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={handleNewChat}
              aria-label={t('ai.newChat')}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                className={`flex w-full items-center justify-center rounded-md p-1.5 transition-colors ${
                  activeConvId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => loadMessages(conv.id)}
                title={conv.title || t('ai.newChat')}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <h1 className="text-sm font-medium">{t('ai.title')}</h1>
            <p className="truncate text-xs text-muted-foreground">{t('ai.placeholder')}</p>
          </div>
          <Button onClick={handleNewChat} size="sm" variant="outline" className="h-7 gap-1.5 text-xs shrink-0">
            <Plus className="h-3 w-3" /> {t('ai.newChat')}
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {!hasActiveConv ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
              <div className="rounded-2xl bg-primary/10 p-3">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center space-y-1.5">
                <h2 className="text-lg font-semibold">{t('ai.title')}</h2>
                <p className="text-sm text-muted-foreground max-w-sm">{t('ai.placeholder')}</p>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {messages
                .filter((m) => m.role !== 'system')
                .map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'max-w-[75%] bg-primary text-primary-foreground rounded-br-md'
                        : 'max-w-[85%] bg-muted rounded-bl-md'
                    }`}>
                      {m.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      ) : (
                        <Markdown content={m.content} />
                      )}
                    </div>
                  </div>
                ))}
              {analyzing && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('ai.analyzing')}
                  </div>
                </div>
              )}
              {streaming && streamContent && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm">
                    <Markdown content={streamContent} />
                  </div>
                </div>
              )}
              {streaming && !streamContent && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {t('ai.thinking')}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div>
          {mentions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 px-3 pt-2 pb-1">
              {mentions.map((m) => (
                <Badge key={`${m.type}-${m.id}`} variant="secondary" className="gap-1 pr-1 h-5 text-[10px]">
                  {m.type === 'contact' ? (
                    <AvatarDisplay emoji={m.avatar_emoji} imageUrl={m.avatar_url} name={m.name} size="sm" />
                  ) : m.type === 'event' ? (
                    <Calendar className="h-2.5 w-2.5" />
                  ) : m.type === 'tag' ? (
                    <TagIcon className="h-2.5 w-2.5" />
                  ) : (
                    <Wallet className="h-2.5 w-2.5" />
                  )}
                  <span>{m.name}</span>
                  <button type="button" onClick={() => removeMention(m)} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                    <X className="h-2 w-2" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 gap-1 text-[10px] text-primary font-medium"
                onClick={() => handleAnalysis('')}
                disabled={analyzing}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {t('ai.comprehensiveAnalysis')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-1">
              {(['contact', 'event', 'tag'] as const).map((tab) => {
                const Icon = TAB_ICONS[tab]
                return (
                  <button
                    key={tab}
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    onClick={() => triggerMention(tab)}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    @{t(`ai.${TAB_I18N[tab]}`)}
                  </button>
                )
              })}
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={addFinanceMention}
              >
                <Wallet className="h-2.5 w-2.5" />
                {t('ai.financialInsight')}
              </button>
            </div>
          )}

          <div className="relative px-2 pb-2" ref={mentionRef}>
            {mentionPopup && (
              <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border bg-popover shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between border-b bg-muted/30">
                  <div className="flex">
                    {TAB_KEYS.map((tab) => {
                      const Icon = TAB_ICONS[tab]
                      return (
                        <button
                          key={tab}
                          type="button"
                          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                            mentionTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={() => setMentionTab(tab)}
                        >
                          <Icon className="mr-1 inline h-3 w-3" />
                          {t(`ai.${TAB_I18N[tab]}`)}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => setMentionPopup(false)}
                    aria-label="Close"
                  >
                    Esc
                  </button>
                </div>
                <div className="max-h-52 overflow-auto p-1">
                  {mentionTab === 'contact' ? (
                    filteredContacts.length > 0 ? filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => handleSelectMention({ type: 'contact', id: contact.id, name: contact.name, avatar_emoji: contact.avatar_emoji, avatar_url: contact.avatar_url })}
                      >
                        <AvatarDisplay emoji={contact.avatar_emoji} imageUrl={contact.avatar_url} name={contact.name} size="sm" />
                        <span className="truncate">{contact.name}</span>
                      </button>
                    )) : (
                      <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">{t('contacts.noContacts')}</p>
                    )
                  ) : mentionTab === 'event' ? (
                    filteredEvents.length > 0 ? filteredEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => handleSelectMention({ type: 'event', id: event.id, name: event.title, color: event.color })}
                      >
                        {event.color && <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />}
                        <span className="truncate flex-1">{event.title}</span>
                        <span className="shrink-0 text-muted-foreground">{new Date(event.start_time).toLocaleDateString()}</span>
                      </button>
                    )) : (
                      <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">{t('events.noEvents')}</p>
                    )
                  ) : (
                    filteredTags.length > 0 ? filteredTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => handleSelectMention({ type: 'tag', id: tag.id, name: tag.name, color: tag.color })}
                      >
                        <div className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: tag.color }} />
                        <span className="truncate">{tag.name}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {contacts.filter((contact) => contact.tags?.some((ct) => ct.id === tag.id)).length}
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
                className="flex-1 rounded-xl border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring transition-colors outline-none"
                aria-label={t('ai.placeholder')}
                placeholder={t('ai.placeholder')}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                  if (e.key === 'Escape' && mentionPopup) {
                    setMentionPopup(false)
                  }
                }}
                disabled={streaming || analyzing}
              />
              <Button
                onClick={() => void handleSend()}
                disabled={streaming || analyzing || (!input.trim() && mentions.length === 0)}
                size="icon"
                className="shrink-0 rounded-xl h-9 w-9"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('ai.deleteChat')}
        message={t('ai.deleteChatConfirm')}
        confirmText={t('ai.deleteChat')}
        onConfirm={async () => {
          if (deleteTarget !== null) await handleDeleteConv(deleteTarget)
        }}
      />
    </div>
  )
}
