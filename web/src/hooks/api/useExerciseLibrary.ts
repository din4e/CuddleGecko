import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exerciseLibraryApi } from '../../api/exerciseLibrary'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type { ExerciseLibraryItem, ExerciseLibraryInput } from '../../types'

const scope = 'exercise-library'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useExerciseLibrary() {
  return useQuery<ExerciseLibraryItem[]>({
    queryKey: [...allKey(), 'list'] as const,
    queryFn: ({ signal }) => exerciseLibraryApi.list(signal).then((r) => r.data),
  })
}

export function useExerciseLibraryMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: allKey() })
  const create = useMutation({
    mutationFn: (input: ExerciseLibraryInput) => exerciseLibraryApi.create(input),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ExerciseLibraryInput }) => exerciseLibraryApi.update(id, data),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const remove = useMutation({
    mutationFn: (id: number) => exerciseLibraryApi.delete(id),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  return { create, update, remove }
}
