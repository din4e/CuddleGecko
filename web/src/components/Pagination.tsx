import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  return (
    <div className="flex justify-center items-center gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t('common.previous')}
      </Button>
      <span className="text-sm text-muted-foreground">
        {t('common.page')} {page} / {totalPages} ({total})
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {t('common.next')}
      </Button>
    </div>
  )
}
