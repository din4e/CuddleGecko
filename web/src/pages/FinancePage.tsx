import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function FinancePage() {
  const { t } = useTranslation()
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('finance.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('finance.noTransactions')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
