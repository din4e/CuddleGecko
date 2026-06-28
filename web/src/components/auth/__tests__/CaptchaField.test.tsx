import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaptchaField } from '../CaptchaField'

const baseProps = {
  image: 'data:image/png;base64,AAAA',
  answer: '',
  onAnswerChange: vi.fn(),
  onRefresh: vi.fn(),
  labelText: '验证码',
  placeholder: '输入验证码',
  imageAlt: '图形验证码，点击可刷新',
  refreshLabel: '点击刷新',
}

describe('CaptchaField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders label, input and image with accessible alt', () => {
    render(<CaptchaField {...baseProps} />)
    expect(screen.getByText('验证码')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('输入验证码')).toBeInTheDocument()
    expect(screen.getByAltText('图形验证码，点击可刷新')).toBeInTheDocument()
  })

  it('clicking the image refreshes the captcha', async () => {
    const user = userEvent.setup()
    render(<CaptchaField {...baseProps} />)
    await user.click(screen.getByAltText('图形验证码，点击可刷新'))
    expect(baseProps.onRefresh).toHaveBeenCalled()
  })

  it('typing forwards to onAnswerChange', async () => {
    const user = userEvent.setup()
    render(<CaptchaField {...baseProps} />)
    await user.type(screen.getByPlaceholderText('输入验证码'), 'AB')
    expect(baseProps.onAnswerChange).toHaveBeenCalled()
  })
})
