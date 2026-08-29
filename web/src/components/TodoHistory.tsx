import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useTodoActivities } from '../hooks/api/useTodos'
import type { TodoActivity } from '../types'

/** Human-readable label for an activity line, e.g.
 *  "alice completed this task" / "bob · priority: normal → high". */
function ActivitySummary({ activity }: { activity: TodoActivity }) {
  const { t } = useTranslation()
  const actionLabel = t(`todos.activity.${activity.action}`)

  if (activity.action === 'updated' && activity.field) {
    const fieldLabel = t(`todos.activityFields.${activity.field}`)
    // Status values are translated (pending → "Pending"); other fields keep
    // their raw stored value.
    const renderValue = (value: string) => {
      if (!value) return t('todos.activityEmptyValue')
      if (activity.field === 'description') return ''
      if (activity.field === 'status') return t(`todos.${value}`)
      return value
    }
    const oldValue = renderValue(activity.old_value) || t('todos.activityPreviousValue')
    const newValue = renderValue(activity.new_value) || t('todos.activityNewValue')
    return (
      <span>
        <b>{activity.username}</b> {t('todos.activity.updated')} {fieldLabel}: <s className="text-muted-foreground">{oldValue}</s> → {newValue}
        <span className="sr-only">{actionLabel}</span>
      </span>
    )
  }

  return <span><b>{activity.username}</b> {actionLabel}</span>
}

/** Per-todo modification history: a newest-first audit timeline of which user
 *  did what, when. Rendered under the comments module in the detail drawer. */
export function TodoHistory({ todoId }: { todoId: number }) {
  const { t } = useTranslation()
  const { data: activities = [], isPending } = useTodoActivities(todoId)

  return (
    <div>
      {isPending ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('todos.historyEmpty')}</p>
      ) : (
        <ol className="relative space-y-2 border-l pl-3">
          {activities.map((a) => (
            <li key={a.id} className="relative text-xs text-muted-foreground">
              <span className="absolute -left-[17px] top-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              <ActivitySummary activity={a} />
              <span className="ml-1 whitespace-nowrap opacity-75" title={new Date(a.created_at).toLocaleString()}>
                · {new Date(a.created_at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
