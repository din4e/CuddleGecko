import { request } from './client'

export const uploadApi = {
  avatar: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const data = await request.post<{ url: string }>('/upload/avatar', form)
    return { data }
  },
}
