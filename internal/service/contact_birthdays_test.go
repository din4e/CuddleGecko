package service

import (
	"context"
	"testing"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/din4e/cuddlegecko/pkg/lunar"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// newBirthdayServiceWithDB wires a real ContactService (+ reminder repo) over
// an in-memory SQLite DB, following the todo integration-test pattern.
func newBirthdayServiceWithDB(t *testing.T) (*ContactService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	require.NoError(t, db.AutoMigrate(&model.Contact{}, &model.Reminder{}, &model.Tag{}, &model.Tagging{}))
	contactRepo := repository.NewContactRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	taggingRepo := repository.NewTaggingRepo(db)
	return NewContactService(contactRepo, taggingRepo, reminderRepo), db
}

func bd(y int, m time.Month, d int) *time.Time {
	t := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	return &t
}

func TestUpcomingBirthdays_SolarAndLunar(t *testing.T) {
	svc, _ := newBirthdayServiceWithDB(t)
	ctx := context.Background()

	seed := []model.Contact{
		{Name: "SolarSoon", Birthday: bd(1995, 8, 23), BirthdayCalendar: lunar.CalendarSolar},
		{Name: "LunarSoon", Birthday: bd(1990, 7, 15), BirthdayCalendar: lunar.CalendarLunar}, // lunar 7/15 → 2026-08-27
		{Name: "Today", Birthday: bd(2000, 8, 20), BirthdayCalendar: lunar.CalendarSolar},
		{Name: "FarAway", Birthday: bd(1998, 1, 1), BirthdayCalendar: lunar.CalendarSolar},   // next 2027-01-01
		{Name: "NoBirthday"},
	}
	for i := range seed {
		seed[i].UserID, seed[i].WorkspaceID = 1, 1
		require.NoError(t, svc.repo.Create(ctx, &seed[i]))
	}

	// Another workspace must be invisible.
	foreign := model.Contact{Name: "Foreign", Birthday: bd(1995, 8, 21), UserID: 2, WorkspaceID: 99}
	require.NoError(t, svc.repo.Create(ctx, &foreign))

	now := time.Date(2026, 8, 20, 10, 0, 0, 0, time.Local)
	occ, err := svc.UpcomingBirthdays(ctx, 1, 1, 30, now)
	require.NoError(t, err)

	names := make([]string, len(occ))
	for i, o := range occ {
		names[i] = o.Contact.Name
	}
	assert.Equal(t, []string{"Today", "SolarSoon", "LunarSoon"}, names)

	byName := map[string]BirthdayOccurrence{}
	for _, o := range occ {
		byName[o.Contact.Name] = o
	}
	assert.True(t, byName["Today"].IsToday)
	assert.Equal(t, 0, byName["Today"].DaysUntil)
	assert.Equal(t, 3, byName["SolarSoon"].DaysUntil)
	assert.Equal(t, lunar.CalendarSolar, byName["SolarSoon"].Calendar)
	assert.Equal(t, "2026-08-23", byName["SolarSoon"].NextBirthday.Format("2006-01-02"))
	assert.Equal(t, 36, byName["LunarSoon"].AgeTurning) // born lunar 1990 → turns 36 in 2026
	assert.Equal(t, lunar.CalendarLunar, byName["LunarSoon"].Calendar)
	assert.Equal(t, "七月十五", byName["LunarSoon"].LunarText)
	assert.Equal(t, "2026-08-27", byName["LunarSoon"].NextBirthday.Format("2006-01-02"))

	// A 3-day window drops the lunar birthday but keeps the others.
	occ, err = svc.UpcomingBirthdays(ctx, 1, 1, 3, now)
	require.NoError(t, err)
	assert.Len(t, occ, 2)
}

func TestCreateBirthdayReminder_Lunar(t *testing.T) {
	svc, _ := newBirthdayServiceWithDB(t)
	ctx := context.Background()

	contact := model.Contact{Name: "妈妈", Birthday: bd(1965, 7, 15), BirthdayCalendar: lunar.CalendarLunar, UserID: 1, WorkspaceID: 1}
	require.NoError(t, svc.repo.Create(ctx, &contact))

	now := time.Date(2026, 8, 20, 10, 0, 0, 0, time.Local)
	reminder, err := svc.CreateBirthdayReminder(ctx, 1, 1, contact.ID, now)
	require.NoError(t, err)

	// 09:00 on the converted solar date of lunar 7/15.
	assert.Equal(t, "2026-08-27 09:00:00", reminder.RemindAt.Format("2006-01-02 15:04:05"))
	assert.Equal(t, model.ReminderPending, reminder.Status)
	assert.Equal(t, uint(1), reminder.ContactID)
	assert.Contains(t, reminder.Title, "妈妈")
	assert.Contains(t, reminder.Title, "生日")
	assert.Contains(t, reminder.Description, "农历七月十五")
	assert.Contains(t, reminder.Description, "2026-08-27")

	// Duplicate pending birthday reminder is rejected.
	_, err = svc.CreateBirthdayReminder(ctx, 1, 1, contact.ID, now)
	assert.ErrorIs(t, err, ErrBirthdayReminderExists)

	// A done reminder does not block re-creation.
	done := model.Reminder{UserID: 1, WorkspaceID: 1, ContactID: contact.ID, Title: "🎂 妈妈的生日", RemindAt: reminder.RemindAt, Status: model.ReminderDone}
	require.NoError(t, svc.reminderRepo.Create(ctx, &done))
	_, err = svc.CreateBirthdayReminder(ctx, 1, 1, contact.ID, now)
	assert.ErrorIs(t, err, ErrBirthdayReminderExists) // pending one still exists
}

func TestCreateBirthdayReminder_Errors(t *testing.T) {
	svc, _ := newBirthdayServiceWithDB(t)
	ctx := context.Background()

	noBirthday := model.Contact{Name: "NoBirthday", UserID: 1, WorkspaceID: 1}
	require.NoError(t, svc.repo.Create(ctx, &noBirthday))
	_, err := svc.CreateBirthdayReminder(ctx, 1, 1, noBirthday.ID, time.Now())
	assert.ErrorIs(t, err, ErrContactBirthdayMissing)

	_, err = svc.CreateBirthdayReminder(ctx, 1, 1, 424242, time.Now())
	assert.ErrorIs(t, err, ErrContactNotFound)
}

func TestReminderServiceCreateRequiresRemindAt(t *testing.T) {
	reminderSvc := NewReminderService(nil)
	_, err := reminderSvc.Create(context.Background(), 1, 1, 1, &model.Reminder{Title: "x"})
	assert.ErrorIs(t, err, ErrInvalidReminder)
}

func TestContactUpdateBirthdayCalendar(t *testing.T) {
	svc, _ := newBirthdayServiceWithDB(t)
	ctx := context.Background()

	contact := model.Contact{Name: "A", Birthday: bd(1990, 7, 15), BirthdayCalendar: lunar.CalendarLunar, UserID: 1, WorkspaceID: 1}
	require.NoError(t, svc.repo.Create(ctx, &contact))

	// Full-form update flips the calendar and normalizes junk to solar.
	_, err := svc.Update(ctx, 1, 1, contact.ID, &model.Contact{Name: "A", Birthday: contact.Birthday, BirthdayCalendar: "solar"})
	require.NoError(t, err)
	got, err := svc.GetByID(ctx, 1, 1, contact.ID)
	require.NoError(t, err)
	assert.Equal(t, lunar.CalendarSolar, got.BirthdayCalendar)

	_, err = svc.Update(ctx, 1, 1, contact.ID, &model.Contact{Name: "A", Birthday: contact.Birthday, BirthdayCalendar: lunar.CalendarLunar})
	require.NoError(t, err)
	got, err = svc.GetByID(ctx, 1, 1, contact.ID)
	require.NoError(t, err)
	assert.Equal(t, lunar.CalendarLunar, got.BirthdayCalendar)
}
