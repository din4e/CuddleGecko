import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function EventsPage() {
  const { t } = useTranslation()
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('events.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('events.noEvents')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
