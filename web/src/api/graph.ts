import { request } from './client'
import type { GraphData } from '../types'

export const graphApi = {
  get: () => request.get<GraphData>('/graph').then((data) => ({ data })),
}
