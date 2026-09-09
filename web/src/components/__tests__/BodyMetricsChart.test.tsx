import { describe, it, expect, vi } from 'vitest'
import { cloneElement, type ReactElement } from 'react'
import { render } from '@testing-library/react'
import { BodyMetricsChart } from '../BodyMetricsChart'
import type { BodyMetric } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'zh' } }),
}))

// jsdom reports 0×0 for ResponsiveContainer's measurement, and recharts skips
// rendering a 0-sized chart — inject a fixed size so the chart fully renders.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => (
      <div>{cloneElement(children, { width: 600, height: 288 } as never)}</div>
    ),
  }
})

function metric(weight: number, day: number): BodyMetric {
  return {
    id: day, user_id: 1, workspace_id: 1,
    recorded_at: new Date(Date.UTC(2026, 8, day)).toISOString(),
    weight, height: null, body_fat: null, muscle_mass: null, resting_hr: null,
    systolic: null, diastolic: null, sleep_hours: null, steps: null,
    energy: null, mood: null, notes: '',
    created_at: '', updated_at: '',
  }
}

describe('BodyMetricsChart', () => {
  it('renders nothing without data', () => {
    const { container } = render(<BodyMetricsChart metrics={[]} metric="weight" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders a chart svg for weight data', () => {
    const { container } = render(
      <BodyMetricsChart metrics={[metric(68, 1), metric(70, 2), metric(72, 3)]} metric="weight" />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders both lines for the blood-pressure metric', () => {
    const data: BodyMetric[] = [1, 2, 3].map((day) => ({
      ...metric(0, day),
      weight: null, systolic: 118 + day, diastolic: 78 + day,
    }))
    const { container } = render(<BodyMetricsChart metrics={data} metric="bp" />)
    const lines = container.querySelectorAll('.recharts-line-curve')
    expect(lines.length).toBe(2)
  })
})
