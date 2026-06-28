import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from '../PasswordInput'

describe('PasswordInput', () => {
  it('is masked by default', () => {
    const { container } = render(<PasswordInput id="pw" showLabel="显示密码" hideLabel="隐藏密码" />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('password')
  })

  it('toggles to visible text and updates a11y state', async () => {
    const user = userEvent.setup()
    const { container } = render(<PasswordInput id="pw" showLabel="显示密码" hideLabel="隐藏密码" />)
    const input = container.querySelector('input') as HTMLInputElement

    const toggle = screen.getByRole('button', { name: '显示密码' })
    await user.click(toggle)

    expect(input.type).toBe('text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('aria-label', '隐藏密码')
  })
})
