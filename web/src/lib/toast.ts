import i18n from '../i18n'
import { toast } from 'sonner'

// mutationErrorToast surfaces TanStack mutation failures that would otherwise be
// silent — the create/update/delete hooks don't catch, so without this a failed
// create/update/delete leaves the dialog open with no feedback. Used only on
// hooks whose callers don't already handle errors (TodosPage keeps its own
// specific handlers, so the todo hooks intentionally opt out).
export function mutationErrorToast() {
  toast.error(i18n.t('common.error'))
}
