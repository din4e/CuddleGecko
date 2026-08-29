import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Cake } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import AvatarDisplay from '@/components/AvatarDisplay'
import { useUpcomingBirthdays } from '@/hooks/api/useContacts'
import type { UpcomingBirthday } from '@/types'

/**
 * "Upcoming birthdays" strip for the buddies page. The backend resolves each
 * birthday (lunar included) to its next Gregorian date, sorted by occurrence.
 */
export default function UpcomingBirthdaysCard({ days = 30 }: { days?: number }) {
  const { t } = useTranslation()
  const { data, isPending } = useUpcomingBirthdays(days)

  if (isPending || !data || data.length === 0) return null

  return (
    <Card data-testid="upcoming-birthdays">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cake className="h-5 w-5 text-rose-500" />
          {t('contacts.upcomingBirthdays')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((b) => (
            <BirthdayRow key={b.contact.id} birthday={b} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BirthdayRow({ birthday }: { birthday: UpcomingBirthday }) {
  const { t } = useTranslation()
  const c = birthday.contact

  const countdown = birthday.is_today
    ? t('contacts.birthdayToday')
    : t('contacts.birthdayInDays', { count: birthday.days_until })
  const dateLabel = new Date(birthday.next_birthday).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })

  return (
    <Link
      to={`/buddies/${c.id}`}
      className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-accent"
    >
      <AvatarDisplay emoji={c.avatar_emoji} imageUrl={c.avatar_url} name={c.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{c.name}</span>
          {birthday.calendar === 'lunar' && (
            <Badge variant="outline" className="shrink-0 text-[10px]">农历</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {birthday.lunar_text && birthday.calendar === 'lunar' ? `${birthday.lunar_text} · ` : ''}
          {dateLabel}
        </div>
      </div>
      <span
        className={`shrink-0 text-sm ${birthday.is_today ? 'font-semibold text-rose-500' : 'text-muted-foreground'}`}
      >
        {countdown}
      </span>
    </Link>
  )
}
