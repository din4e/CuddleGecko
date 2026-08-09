import type { TodoPriority } from '../types'

// Natural-language quick-add parsing for todos, a la TickTick: typed text is
// scanned for a date, a time and a priority; matches are extracted and the
// remainder becomes the task title.
//
// Supported (English + Chinese):
//   dates  : today/tomorrow/今天/明天/后天/大后天, next week/下周,
//            monday..sunday / 周一..周日 / 星期一..星期日 (+optional 下/这),
//            "in N days" / N天后
//   times  : 24h HH:MM, 12h with am/pm, N点 (+optional 上午/下午/早上/晚上/凌晨)
//   priority: !high/!1, !med/!medium/!2/!normal, !low/!3
//   tags   : #tag (matched against existing workspace tags by the caller)

export interface ParsedQuickAdd {
  title: string
  due: Date | null
  priority?: TodoPriority
  tags: string[]
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// JS getDay(): Sunday=0 ... Saturday=6
const ZH_WEEKDAY: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
}

const EN_WEEKDAYS: { re: RegExp; target: number }[] = [
  { re: /\bsunday\b|\bsun\b/i, target: 0 },
  { re: /\bmonday\b|\bmon\b/i, target: 1 },
  { re: /\btuesday\b|\btues?\b/i, target: 2 },
  { re: /\bwednesday\b|\bwed\b/i, target: 3 },
  { re: /\bthursday\b|\bthu[r]?\b/i, target: 4 },
  { re: /\bfriday\b|\bfri\b/i, target: 5 },
  { re: /\bsaturday\b|\bsat\b/i, target: 6 },
]

function nextWeekday(now: Date, target: number): Date {
  const cur = now.getDay()
  let diff = (target - cur + 7) % 7
  if (diff === 0) diff = 7 // same day → next week
  return addDays(startOfDay(now), diff)
}

interface Match {
  date: Date
  matched: string
}

function findDate(text: string, now: Date): Match | null {
  // 1. "in N days" / N天后
  const inN = text.match(/\bin (\d{1,3}) days?\b/i)
  if (inN) return { date: addDays(startOfDay(now), parseInt(inN[1], 10)), matched: inN[0] }
  const zhN = text.match(/(\d{1,3})天后?/)
  if (zhN) return { date: addDays(startOfDay(now), parseInt(zhN[1], 10)), matched: zhN[0] }

  // 2. Chinese weekday with optional 下/这 prefix
  const zhWk = text.match(/(?:下|这)?(?:周|星期|礼拜)([一二三四五六日天])/)
  if (zhWk) {
    const target = ZH_WEEKDAY[zhWk[1]]
    if (target !== undefined) return { date: nextWeekday(now, target), matched: zhWk[0] }
  }

  // 3. English weekday
  for (const { re, target } of EN_WEEKDAYS) {
    const m = text.match(re)
    if (m) return { date: nextWeekday(now, target), matched: m[0] }
  }

  // 4. Chinese relative keywords
  const zhRel = text.match(/大后天|后天|今天|今日|明天|下周/)
  if (zhRel) {
    const map: Record<string, number> = { '大后天': 3, '后天': 2, '今天': 0, '今日': 0, '明天': 1, '下周': 7 }
    return { date: addDays(startOfDay(now), map[zhRel[0]]), matched: zhRel[0] }
  }

  // 5. English relative keywords
  const enRel = text.match(/\bnext week\b/i)
  if (enRel) return { date: addDays(startOfDay(now), 7), matched: enRel[0] }
  if (/\btoday\b/i.test(text)) return { date: startOfDay(now), matched: 'today' }
  if (/\btomorrow\b/i.test(text)) return { date: addDays(startOfDay(now), 1), matched: 'tomorrow' }

  return null
}

interface TimeMatch {
  h: number
  m: number
  matched: string
}

function applyPeriod(period: string | undefined, h: number): number {
  if ((period === '下午' || period === '晚上') && h < 12) return h + 12
  if ((period === '上午' || period === '早上' || period === '凌晨') && h === 12) return 0
  return h
}

function findTime(text: string): TimeMatch | null {
  // 12h with am/pm: 5pm, 5:30pm, 12am
  const ap = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (ap) {
    let h = parseInt(ap[1], 10)
    const m = ap[2] ? parseInt(ap[2], 10) : 0
    const suf = ap[3].toLowerCase()
    if (suf === 'pm' && h < 12) h += 12
    if (suf === 'am' && h === 12) h = 0
    return { h, m, matched: ap[0] }
  }
  // Chinese period + colon time, no 点 needed: 下午5:30
  const zhColon = text.match(/(上午|早上|下午|晚上|凌晨)\s*(\d{1,2}):(\d{1,2})/)
  if (zhColon) {
    return {
      h: applyPeriod(zhColon[1], parseInt(zhColon[2], 10)),
      m: parseInt(zhColon[3], 10),
      matched: zhColon[0],
    }
  }
  // Chinese 点-form: (period)? N(:MM)?点  e.g. 下午5点, 9点, 早上9:30点
  const zh = text.match(/(上午|早上|下午|晚上|凌晨)?\s*(\d{1,2})(?::(\d{1,2}))?点/)
  if (zh) {
    return {
      h: applyPeriod(zh[1], parseInt(zh[2], 10)),
      m: zh[3] ? parseInt(zh[3], 10) : 0,
      matched: zh[0],
    }
  }
  // 24h HH:MM
  const t24 = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (t24) return { h: parseInt(t24[1], 10), m: parseInt(t24[2], 10), matched: t24[0] }
  return null
}

export function parseQuickAdd(input: string, now: Date = new Date()): ParsedQuickAdd {
  let text = input
  let due: Date | null = null
  let priority: TodoPriority | undefined

  const date = findDate(text, now)
  if (date) {
    due = date.date
    text = text.replace(date.matched, ' ')
  }

  const time = findTime(text)
  if (time) {
    const base = due ? new Date(due) : new Date(now)
    base.setHours(time.h, time.m, 0, 0)
    due = base
    text = text.replace(time.matched, ' ')
  }

  // Priority: !high/!1, !med/!medium/!2/!normal, !low/!3 (TickTick's "!" syntax).
  const pm = text.match(/!(high|1|med(?:ium)?|2|normal|low|3)\b/i)
  if (pm) {
    const code = pm[1].toLowerCase()
    if (code === 'high' || code === '1') {
      priority = 'high'
    } else if (code === 'low' || code === '3') {
      priority = 'low'
    } else {
      priority = 'normal'
    }
    text = text.replace(pm[0], ' ')
  }

  // Tags: #tag tokens (word chars + CJK). The caller resolves names to tag IDs.
  const tagMatches = text.match(/#[\w一-龥]+/g)
  if (tagMatches) {
    text = text.replace(/#[\w一-龥]+/g, ' ')
  }
  const tags = tagMatches ? tagMatches.map((m) => m.slice(1)) : []

  const title = text.replace(/\s{2,}/g, ' ').trim()
  return { title, due, priority, tags }
}
