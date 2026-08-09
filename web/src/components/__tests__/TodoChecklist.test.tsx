import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoChecklist } from '../TodoChecklist'
import type { TodoItem } from '../../types'

const mocks = vi.hoisted(() => ({
  toggleItem: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  updateItem: vi.fn(),
  reorderItem: vi.fn(),
  promoteItem: vi.fn(),
  items: [] as TodoItem[],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useTodoItems: () => ({ data: mocks.items }),
  useCreateTodoItem: () => ({ mutate: mocks.createItem, mutateAsync: mocks.createItem, isPending: false }),
  useToggleTodoItem: () => ({ mutate: mocks.toggleItem, mutateAsync: mocks.toggleItem }),
  useDeleteTodoItem: () => ({ mutate: mocks.deleteItem, mutateAsync: mocks.deleteItem }),
  useUpdateTodoItem: () => ({ mutate: mocks.updateItem, mutateAsync: mocks.updateItem }),
  useReorderTodoItem: () => ({ mutate: mocks.reorderItem, mutateAsync: mocks.reorderItem }),
  usePromoteTodoItem: () => ({ mutate: mocks.promoteItem, mutateAsync: mocks.promoteItem }),
}))

describe('TodoChecklist', () => {
  beforeEach(() => {
    mocks.toggleItem.mockReset()
    mocks.createItem.mockReset()
    mocks.deleteItem.mockReset()
    mocks.updateItem.mockReset()
    mocks.reorderItem.mockReset()
    mocks.promoteItem.mockReset()
    mocks.items = [{ id: 5, todo_id: 1, content: 'step', done: false, sort_order: 0, created_at: '', updated_at: '' }]
  })

  it('renders items and toggles on click', async () => {
    render(<TodoChecklist todoId={1} />)
    // The toggle is the first button (Circle) before the item content.
    const toggleBtn = document.querySelector('button') as HTMLButtonElement
    await userEvent.click(toggleBtn)
    expect(mocks.toggleItem).toHaveBeenCalledWith(5)
  })

  it('adds a subtask on Enter', async () => {
    const user = userEvent.setup()
    render(<TodoChecklist todoId={1} />)
    // The add-item input is the last input in the checklist; type into it and Enter.
    const addInput = document.querySelector('input[placeholder]') as HTMLInputElement
    await user.type(addInput, 'new step')
    await user.keyboard('{Enter}')
    expect(mocks.createItem).toHaveBeenCalledWith('new step')
  })

  it('promotes an item on the up-right button', async () => {
    const user = userEvent.setup()
    render(<TodoChecklist todoId={1} />)
    // The promote button is the one whose title attr = move-promote label.
    const promoteBtn = screen.getByTitle('todos.promoteTitle')
    await user.click(promoteBtn)
    expect(mocks.promoteItem).toHaveBeenCalledWith(5)
  })
})
