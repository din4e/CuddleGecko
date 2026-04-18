import client from './client'

export const uploadApi = {
  avatar: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await client.post<{ url: string }>('/upload/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res
  },
}
