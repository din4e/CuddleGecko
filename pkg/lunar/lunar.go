// Package lunar converts birthdays between the Gregorian (solar) and Chinese
// lunar calendars and computes anniversary occurrences.
//
// Storage convention: a contact's Birthday always holds a Y/M/D triple. When
// the contact's calendar is "lunar", that triple is a lunar date (leap months
// are not representable — the regular month is used) rather than a Gregorian
// one; the anniversary rules below convert it to the matching solar date each
// year.
package lunar

import (
	"fmt"
	"time"

	"github.com/6tail/lunar-go/LunarUtil"
	"github.com/6tail/lunar-go/calendar"
)

const (
	CalendarSolar = "solar"
	CalendarLunar = "lunar"
)

// NormalizeCalendar maps any input to a known calendar value; anything other
// than an explicit "lunar" is treated as solar (covers legacy rows and empty
// strings from partial updates).
func NormalizeCalendar(s string) string {
	if s == CalendarLunar {
		return CalendarLunar
	}
	return CalendarSolar
}

// NextOccurrence returns the next anniversary date (in the Gregorian calendar)
// of a birthday at or after the local-midnight of `now`.
//
// Solar birthdays repeat the stored month/day; Feb 29 falls back to Feb 28 in
// common years. Lunar birthdays repeat the lunar month/day — when the day
// doesn't exist that lunar year (e.g. 三十 in a 29-day month) the last day of
// that lunar month is used, matching the common "过廿九" convention.
func NextOccurrence(birthday time.Time, calendarType string, now time.Time) (time.Time, error) {
	_, m, d := birthday.Date()
	switch NormalizeCalendar(calendarType) {
	case CalendarLunar:
		return nextLunar(int(m), d, now)
	default:
		return nextSolar(int(m), d, now), nil
	}
}

// nextSolar returns the next solar anniversary of (month, day) on or after
// today's local date.
func nextSolar(month, day int, now time.Time) time.Time {
	today := midnight(now)
	for year := now.Year(); ; year++ {
		if candidate := anniversarySolar(year, month, day, now.Location()); !candidate.Before(today) {
			return candidate
		}
	}
}

// anniversarySolar builds the (month, day) date in the given year, clamping
// Feb 29 to Feb 28 in common years.
func anniversarySolar(year, month, day int, loc *time.Location) time.Time {
	if month == int(time.February) && day == 29 && !isLeapYear(year) {
		day = 28
	}
	if day > daysInMonth(year, month) {
		day = daysInMonth(year, month)
	}
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, loc)
}

// nextLunar returns the next solar date of the lunar (month, day) anniversary
// on or after today's local date. The anniversary repeats in the current and
// following lunar years.
func nextLunar(lunarMonth, lunarDay int, now time.Time) (time.Time, error) {
	today := midnight(now)
	for year := now.Year(); ; year++ {
		candidate, err := lunarToSafeSolar(year, lunarMonth, lunarDay, now.Location())
		if err != nil {
			return time.Time{}, err
		}
		if !candidate.Before(today) {
			return candidate, nil
		}
	}
}

// lunarToSafeSolar converts a lunar date to solar, clamping the day to the
// last day of that lunar month when it doesn't exist (三十 in a 29-day month).
// The upstream library panics on invalid input, so a recover converts panics
// from out-of-range years into errors.
func lunarToSafeSolar(year, month, day int, loc *time.Location) (result time.Time, err error) {
	defer func() {
		if r := recover(); r != nil {
			result, err = time.Time{}, fmt.Errorf("invalid lunar date %d-%d-%d: %v", year, month, day, r)
		}
	}()
	lunarMonth := calendar.NewLunarMonthFromYm(year, month)
	if lunarMonth == nil {
		return time.Time{}, fmt.Errorf("lunar year %d has no month %d", year, month)
	}
	if day > lunarMonth.GetDayCount() {
		day = lunarMonth.GetDayCount()
	}
	if day < 1 {
		day = 1
	}
	solar := calendar.NewLunarFromYmd(year, month, day).GetSolar()
	return time.Date(solar.GetYear(), time.Month(solar.GetMonth()), solar.GetDay(), 0, 0, 0, 0, loc), nil
}

// MonthDayText renders a lunar month/day in Chinese, e.g. "六月廿五" /
// "腊月三十". Month is 1-12; day is 1-30 (no calendar lookup needed).
func MonthDayText(lunarMonth, lunarDay int) string {
	m, d := "", ""
	if lunarMonth >= 1 && lunarMonth < len(LunarUtil.MONTH) {
		m = LunarUtil.MONTH[lunarMonth]
	}
	if lunarDay >= 1 && lunarDay < len(LunarUtil.DAY) {
		d = LunarUtil.DAY[lunarDay]
	}
	if m == "" {
		m = fmt.Sprintf("%d", lunarMonth)
	}
	if d == "" {
		d = fmt.Sprintf("%d", lunarDay)
	}
	return m + "月" + d
}

func midnight(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func isLeapYear(year int) bool {
	return year%4 == 0 && (year%100 != 0 || year%400 == 0)
}

func daysInMonth(year, month int) int {
	for d := 31; d >= 28; d-- {
		if time.Date(year, time.Month(month), d, 0, 0, 0, 0, time.UTC).Month() == time.Month(month) {
			return d
		}
	}
	return 28
}
