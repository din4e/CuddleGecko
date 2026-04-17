import client from './client'
import type { GraphData } from '../types'

export const graphApi = {
  get: () => client.get<GraphData>('/graph'),
}
