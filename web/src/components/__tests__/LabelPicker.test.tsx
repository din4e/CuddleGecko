import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TodoLabelPicker from '../LabelPicker'
import { tagsApi } from '../../api/tags'
import type { Tag } from '../../types'

// Node's global localStorage is undefined in tests; rootKey reads it at call
// time when the search query is created.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

vi.mock('../../api/tags', () => ({ tagsApi: { list: vi.fn(), create: vi.fn() } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: { name?: string }) => values?.name ? `${key} ${values.name}` : key }) }))
const a = { id: 1, name: 'Work', color: '#22c55e' } as Tag
const b = { id: 2, name: 'Home', color: '#3b82f6' } as Tag
const remote = { id: 250, name: 'Remote label', color: '#f97316' } as Tag
const pending = vi.fn()

function setup(candidates: Tag[] = [], initial: number[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Harness() {
    const [ids, setIds] = useState(initial)
    return <><TodoLabelPicker candidates={candidates} value={ids} onChange={setIds} onPendingChange={pending} /><output data-testid="selection">{ids.join(',')}</output></>
  }
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  return userEvent.setup()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(tagsApi.list).mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 50 } })
})

describe('TodoLabelPicker', () => {
  it('selects several labels without closing and removes one independently', async () => {
    const user = setup([a, b])
    await user.click(screen.getByRole('button', { name: 'labels.title' }))
    await user.click(screen.getByRole('option', { name: 'Work' }))
    await user.click(screen.getByRole('option', { name: 'Home' }))
    expect(screen.getByTestId('selection')).toHaveTextContent('1,2')
    expect(screen.getByRole('option', { name: 'Work' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'labels.remove Work' }))
    expect(screen.getByTestId('selection')).toHaveTextContent('2')
  })

  it('searches beyond the loaded candidates and remembers the selected name', async () => {
    vi.mocked(tagsApi.list).mockImplementation(async (page, _size, _signal, query) => ({ data: { items: query === 'remote' ? [remote] : [], total: query === 'remote' ? 1 : 0, page: page ?? 1, page_size: 50 } }))
    const user = setup([a])
    await user.click(screen.getByRole('button', { name: 'labels.title' }))
    await user.type(screen.getByRole('combobox'), 'remote')
    await user.click(await screen.findByRole('option', { name: remote.name }))
    expect(tagsApi.list).toHaveBeenCalledWith(1, 50, expect.any(AbortSignal), 'remote')
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: `labels.remove ${remote.name}` })).toBeInTheDocument()
    expect(screen.getByTestId('selection')).toHaveTextContent('250')
  })

  it('creates from an empty library and automatically selects the global label', async () => {
    vi.mocked(tagsApi.create).mockResolvedValue({ data: remote })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'labels.title' }))
    await user.type(screen.getByRole('combobox'), ' Remote label ')
    await user.click(await screen.findByRole('button', { name: 'labels.create Remote label' }))
    expect(tagsApi.create).toHaveBeenCalledWith({ name: 'Remote label', color: '#22c55e' })
    await waitFor(() => expect(screen.getByTestId('selection')).toHaveTextContent('250'))
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(pending).toHaveBeenNthCalledWith(1, true)
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('does not offer a duplicate and supports keyboard multi-selection', async () => {
    const user = setup([a, b])
    await user.click(screen.getByRole('button', { name: 'labels.title' }))
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus())
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(screen.getByTestId('selection')).toHaveTextContent('1,2')
    await user.type(screen.getByRole('combobox'), ' WORK ')
    await waitFor(() => expect(tagsApi.list).toHaveBeenCalledWith(1, 50, expect.any(AbortSignal), 'work'))
    expect(screen.queryByRole('button', { name: /labels.create/ })).not.toBeInTheDocument()
  })

  it('retains the query after creation fails', async () => {
    vi.mocked(tagsApi.create).mockRejectedValue(new Error('offline'))
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'labels.title' }))
    await user.type(screen.getByRole('combobox'), 'New label')
    await user.click(await screen.findByRole('button', { name: 'labels.create New label' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('labels.createError')
    expect(screen.getByRole('combobox')).toHaveValue('New label')
    expect(screen.getByTestId('selection')).toBeEmptyDOMElement()
    expect(pending).toHaveBeenLastCalledWith(false)
  })
})
