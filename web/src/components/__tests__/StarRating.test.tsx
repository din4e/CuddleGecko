import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StarRating } from '../StarRating'

describe('StarRating', () => {
  it('sets the score when a star is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StarRating value={null} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: '4/10' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('clears the score when the current star is clicked again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StarRating value={4} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: '4/10' }))
    expect(onChange).toHaveBeenCalledWith(null)
    // a different star still replaces the value
    await user.click(screen.getByRole('radio', { name: '7/10' }))
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('renders ten stars and shows the n/10 indicator when set', () => {
    render(<StarRating value={7} onChange={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(10)
    expect(screen.getByText('7/10')).toBeInTheDocument()
  })

  it('readOnly renders no controls and exposes the score via aria-label', () => {
    render(<StarRating value={5} readOnly />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByLabelText('5/10')).toBeInTheDocument()
  })
})
