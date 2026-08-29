package lunar

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// now is pinned so the "next occurrence" assertions don't drift with the
// calendar; date(…) builds local-midnight times.
func date(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 12, 0, 0, 0, time.Local)
}

func TestNormalizeCalendar(t *testing.T) {
	assert.Equal(t, CalendarSolar, NormalizeCalendar(""))
	assert.Equal(t, CalendarSolar, NormalizeCalendar("solar"))
	assert.Equal(t, CalendarSolar, NormalizeCalendar("nonsense"))
	assert.Equal(t, CalendarLunar, NormalizeCalendar("lunar"))
}

func TestNextOccurrence_Solar(t *testing.T) {
	now := date(2026, 8, 29)

	// Same-year occurrence still ahead.
	next, err := NextOccurrence(date(1995, 12, 25), CalendarSolar, now)
	require.NoError(t, err)
	assert.Equal(t, 2026, next.Year())
	assert.Equal(t, time.December, next.Month())
	assert.Equal(t, 25, next.Day())

	// Already passed this year → next year.
	next, err = NextOccurrence(date(1998, 7, 22), CalendarSolar, now)
	require.NoError(t, err)
	assert.Equal(t, 2027, next.Year())
	assert.Equal(t, time.July, next.Month())
	assert.Equal(t, 22, next.Day())

	// Today counts as today.
	next, err = NextOccurrence(date(1990, 8, 29), CalendarSolar, now)
	require.NoError(t, err)
	assert.Equal(t, 2026, next.Year())
	assert.Equal(t, time.August, next.Month())
	assert.Equal(t, 29, next.Day())

	// Feb 29 → Feb 28 in common years, Feb 29 in leap years.
	next, err = NextOccurrence(date(2000, 2, 29), CalendarSolar, date(2026, 1, 1))
	require.NoError(t, err)
	assert.Equal(t, "2026-02-28", next.Format("2006-01-02"))
	next, err = NextOccurrence(date(2000, 2, 29), CalendarSolar, date(2027, 3, 1))
	require.NoError(t, err)
	assert.Equal(t, "2028-02-29", next.Format("2006-01-02"))
}

func TestNextOccurrence_Lunar(t *testing.T) {
	// Known conversion: lunar 1990-06-25 is solar 1990-08-15; lunar 7/15 maps
	// to 2026-08-27 and 2027-08-16 (verified against the lunar calendar).
	now := date(2026, 8, 29)

	// Lunar 六月廿五 (stored as 1990-06-25): the 2026 occurrence (solar
	// 2026-08-08) has passed → next is the 2027 lunar year.
	next, err := NextOccurrence(date(1990, 6, 25), CalendarLunar, now)
	require.NoError(t, err)
	assert.Equal(t, "2027-07-28", next.Format("2006-01-02"))

	// Lunar 七月十五 falls on 2026-08-27 — still ahead when checked 08-20.
	next, err = NextOccurrence(date(1990, 7, 15), CalendarLunar, date(2026, 8, 20))
	require.NoError(t, err)
	assert.Equal(t, "2026-08-27", next.Format("2006-01-02"))

	// On the day itself the occurrence is today.
	next, err = NextOccurrence(date(1990, 7, 15), CalendarLunar, date(2026, 8, 27))
	require.NoError(t, err)
	assert.Equal(t, "2026-08-27", next.Format("2006-01-02"))

	// From mid-September the same lunar birthday rolls to 2027-08-16.
	next, err = NextOccurrence(date(1990, 7, 15), CalendarLunar, date(2026, 9, 15))
	require.NoError(t, err)
	assert.Equal(t, "2027-08-16", next.Format("2006-01-02"))
}

func TestNextOccurrence_LunarThirtyClampsToLastDay(t *testing.T) {
	// Lunar 2026 month 7 has 29 days, so 三十 must clamp to 廿九:
	// lunar 7/15 = 2026-08-27 ⇒ 7/29 = 2026-09-10.
	next, err := NextOccurrence(date(1990, 7, 30), CalendarLunar, date(2026, 1, 1))
	require.NoError(t, err)
	assert.Equal(t, "2026-09-10", next.Format("2006-01-02"))

	// Lunar 1990 month 6 also has 29 days → 廿九 = 1990-08-19.
	next, err = NextOccurrence(date(1990, 6, 30), CalendarLunar, date(1990, 1, 1))
	require.NoError(t, err)
	assert.Equal(t, "1990-08-19", next.Format("2006-01-02"))

	// In years where the month does have 30 days, 三十 stays 三十:
	// lunar 1988-1-30 = solar 1988-03-17.
	next, err = NextOccurrence(date(1988, 1, 30), CalendarLunar, date(1988, 1, 1))
	require.NoError(t, err)
	assert.Equal(t, "1988-03-17", next.Format("2006-01-02"))
}

func TestMonthDayText(t *testing.T) {
	assert.Equal(t, "正月初一", MonthDayText(1, 1))
	assert.Equal(t, "六月廿五", MonthDayText(6, 25))
	assert.Equal(t, "腊月三十", MonthDayText(12, 30))
	// Out-of-range values fall back to numerals instead of panicking.
	assert.Equal(t, "13月32", MonthDayText(13, 32))
}
