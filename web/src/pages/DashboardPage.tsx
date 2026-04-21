import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contactsApi } from '../api/contacts'
import { remindersApi } from '../api/reminders'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import type { Reminder } from '../types'
import { Users, CalendarCheck, Bell } from 'lucide-react'

export default function DashboardPage() {
  const { t } = useTranslation()
  const [totalContacts, setTotalContacts] = useState(0)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      contactsApi.list({ page: 1, page_size: 1 }),
      remindersApi.list('pending'),
    ])
      .then(([contactsRes, remindersRes]) => {
        const contactsData = contactsRes.data
        const remindersData = remindersRes.data
        setTotalContacts(contactsData.total || 0)
        setReminders(Array.isArray(remindersData) ? remindersData : [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div>{t('dashboard.loading')}</div>

  const stats = [
    { title: t('dashboard.totalContacts'), value: totalContacts, icon: Users },
    { title: t('dashboard.pendingReminders'), value: reminders.length, icon: Bell },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {stats.map(({ title, value, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {reminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              {t('dashboard.upcomingReminders')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {reminders.slice(0, 5).map((r) => (
                <li key={r.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(r.remind_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
