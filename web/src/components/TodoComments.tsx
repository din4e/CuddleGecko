import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Markdown } from './Markdown'
import { useTodoComments, useCreateTodoComment, useUpdateTodoComment, useDeleteTodoComment } from '../hooks/api/useTodos'
import { useAuthStore } from '../stores/auth'
import type { TodoComment } from '../types'

/** One note row: author chip + rendered markdown. Own notes offer inline
 *  edit / delete; other people's notes are read-only. */
function CommentRow({ todoId, comment }: { todoId: number; comment: TodoComment }) {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.user?.id)
  const updateComment = useUpdateTodoComment(todoId)
  const deleteComment = useDeleteTodoComment(todoId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const own = comment.user_id === userId

  return (
    <div className="group flex gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {comment.username.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{comment.username}</span>
          <span className="text-[11px] text-muted-foreground" title={new Date(comment.created_at).toLocaleString()}>
            {new Date(comment.created_at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {own && !editing && (
            <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={t('todos.commentEdit')}
                onClick={() => { setDraft(comment.content); setEditing(true) }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={t('todos.commentDelete')}
                onClick={() => deleteComment.mutate(comment.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
            <div className="flex justify-end gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!draft.trim() || updateComment.isPending}
                onClick={() =>
                  updateComment.mutate(
                    { commentId: comment.id, content: draft },
                    { onSuccess: () => setEditing(false) },
                  )}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 text-sm">
            <Markdown content={comment.content} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Per-todo notes module: chat-style markdown comments. Rendered under the
 *  todo form inside the detail drawer. */
export function TodoComments({ todoId }: { todoId: number }) {
  const { t } = useTranslation()
  const { data: comments = [], isPending } = useTodoComments(todoId)
  const createComment = useCreateTodoComment(todoId)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const content = draft.trim()
    if (!content) return
    createComment.mutate(content, { onSuccess: () => setDraft('') })
  }

  return (
    <div>
      {isPending ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : comments.length > 0 ? (
        <div className="mb-2 space-y-2">
          {comments.map((c) => <CommentRow key={c.id} todoId={todoId} comment={c} />)}
        </div>
      ) : null}
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('todos.commentPlaceholder')}
        rows={2}
        onKeyDown={(e) => {
          // Enter submits, Shift+Enter inserts a newline — chat convention.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="mt-1.5 flex justify-end">
        <Button size="sm" className="h-7 text-xs" disabled={!draft.trim() || createComment.isPending} onClick={submit}>
          {createComment.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {t('todos.commentSubmit')}
        </Button>
      </div>
    </div>
  )
}
