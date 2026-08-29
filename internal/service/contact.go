package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/lunar"
)

var ErrContactNotFound = errors.New("contact not found")

var (
	// ErrBirthdayReminderExists: a pending reminder for this birthday already exists.
	ErrBirthdayReminderExists = errors.New("birthday reminder already exists")
	// ErrContactBirthdayMissing: the contact has no birthday set.
	ErrContactBirthdayMissing = errors.New("contact has no birthday")
)

// TaggingRepository is the polymorphic tag-association store shared by every
// taggable entity (contacts, todos, ...).
type TaggingRepository interface {
	SetTags(ctx context.Context, workspaceID uint, targetType string, targetID uint, tagIDs []uint) error
	GetTags(ctx context.Context, workspaceID uint, targetType string, targetID uint) ([]model.Tag, error)
	GetTagsByTargets(ctx context.Context, workspaceID uint, targetType string, targetIDs []uint) (map[uint][]model.Tag, error)
	FilterTargetIDs(ctx context.Context, workspaceID uint, targetType string, tagIDs []uint) ([]uint, error)
	RemoveAll(ctx context.Context, workspaceID uint, targetType string, targetID uint) error
}

type ContactRepository interface {
	Create(ctx context.Context, contact *model.Contact) error
	GetByID(ctx context.Context, workspaceID, id uint) (*model.Contact, error)
	GetByIDs(ctx context.Context, workspaceID uint, ids []uint) ([]model.Contact, error)
	List(ctx context.Context, workspaceID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error)
	ListGraphContacts(ctx context.Context, workspaceID uint) ([]model.Contact, error)
	ListWithBirthday(ctx context.Context, workspaceID uint) ([]model.Contact, error)
	ReplaceTags(ctx context.Context, contactID uint, tags []model.Tag) error
	GetTags(ctx context.Context, workspaceID, contactID uint) ([]model.Tag, error)
	Update(ctx context.Context, contact *model.Contact) error
	Delete(ctx context.Context, workspaceID, id uint) error
}

// BirthdayOccurrence pairs a contact with their next birthday resolved to a
// Gregorian date (lunar birthdays converted for the current lunar year).
type BirthdayOccurrence struct {
	Contact      *model.Contact `json:"contact"`
	NextBirthday time.Time      `json:"next_birthday"`
	DaysUntil    int            `json:"days_until"`
	Calendar     string         `json:"calendar"`
	IsToday      bool           `json:"is_today"`
	// AgeTurning is the age reached at the next birthday; 0 when the stored
	// birth year is a placeholder (< 1900) rather than a real birth year.
	AgeTurning int    `json:"age_turning"`
	LunarText  string `json:"lunar_text,omitempty"`
}

type ContactService struct {
	repo        ContactRepository
	taggingRepo TaggingRepository
	// reminderRepo backs CreateBirthdayReminder; contacts own birthday data,
	// so the birthday logic lives here rather than in ReminderService.
	reminderRepo ReminderRepository
}

func NewContactService(repo ContactRepository, taggingRepo TaggingRepository, reminderRepo ReminderRepository) *ContactService {
	return &ContactService{repo: repo, taggingRepo: taggingRepo, reminderRepo: reminderRepo}
}

func (s *ContactService) Create(ctx context.Context, userID, workspaceID uint, contact *model.Contact) (*model.Contact, error) {
	contact.UserID = userID
	contact.WorkspaceID = workspaceID
	if err := s.repo.Create(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) GetByID(ctx context.Context, userID, workspaceID, id uint) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}
	s.populateTags(ctx, workspaceID, []*model.Contact{contact})
	return contact, nil
}

func (s *ContactService) List(ctx context.Context, userID, workspaceID uint, page, pageSize int, search string, tagIDs []uint) ([]model.Contact, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	contacts, total, err := s.repo.List(ctx, workspaceID, page, pageSize, search, tagIDs)
	if err != nil {
		return nil, 0, err
	}
	ptrs := make([]*model.Contact, len(contacts))
	for i := range contacts {
		ptrs[i] = &contacts[i]
	}
	s.populateTags(ctx, workspaceID, ptrs)
	return contacts, total, nil
}

func (s *ContactService) Update(ctx context.Context, userID, workspaceID, id uint, updates *model.Contact) (*model.Contact, error) {
	contact, err := s.repo.GetByID(ctx, workspaceID, id)
	if err != nil {
		return nil, ErrContactNotFound
	}

	if updates.Name != "" {
		contact.Name = updates.Name
	}
	contact.Nickname = updates.Nickname
	contact.AvatarEmoji = updates.AvatarEmoji
	contact.AvatarURL = updates.AvatarURL
	contact.Phone = updates.Phone
	contact.Email = updates.Email
	contact.Birthday = updates.Birthday
	contact.BirthdayCalendar = lunar.NormalizeCalendar(updates.BirthdayCalendar)
	contact.Notes = updates.Notes
	if updates.RelationshipLabels != nil {
		contact.RelationshipLabels = updates.RelationshipLabels
	}

	if err := s.repo.Update(ctx, contact); err != nil {
		return nil, err
	}
	return contact, nil
}

func (s *ContactService) Delete(ctx context.Context, userID, workspaceID, id uint) error {
	if err := s.repo.Delete(ctx, workspaceID, id); err != nil {
		return err
	}
	// Clean up dangling tag associations.
	_ = s.taggingRepo.RemoveAll(ctx, workspaceID, model.TagTargetContact, id)
	return nil
}

func (s *ContactService) ReplaceTags(ctx context.Context, userID, workspaceID, contactID uint, tagIDs []uint) error {
	if _, err := s.repo.GetByID(ctx, workspaceID, contactID); err != nil {
		return ErrContactNotFound
	}
	return s.taggingRepo.SetTags(ctx, workspaceID, model.TagTargetContact, contactID, tagIDs)
}

func (s *ContactService) GetTags(ctx context.Context, userID, workspaceID, contactID uint) ([]model.Tag, error) {
	if _, err := s.repo.GetByID(ctx, workspaceID, contactID); err != nil {
		return nil, ErrContactNotFound
	}
	return s.taggingRepo.GetTags(ctx, workspaceID, model.TagTargetContact, contactID)
}

// populateTags fills the virtual Tags field for a batch of contacts.
func (s *ContactService) populateTags(ctx context.Context, workspaceID uint, contacts []*model.Contact) {
	if s.taggingRepo == nil || len(contacts) == 0 {
		return
	}
	ids := make([]uint, len(contacts))
	for i, c := range contacts {
		ids[i] = c.ID
	}
	tagMap, err := s.taggingRepo.GetTagsByTargets(ctx, workspaceID, model.TagTargetContact, ids)
	if err != nil {
		return
	}
	for _, c := range contacts {
		if tags, ok := tagMap[c.ID]; ok {
			c.Tags = tags
		} else {
			c.Tags = []model.Tag{}
		}
	}
}

// UpcomingBirthdays returns every contact whose next birthday (solar, or the
// solar date of a lunar birthday) falls within `days` days from now, sorted by
// occurrence.
func (s *ContactService) UpcomingBirthdays(ctx context.Context, userID, workspaceID uint, days int, now time.Time) ([]BirthdayOccurrence, error) {
	contacts, err := s.repo.ListWithBirthday(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	occurrences := make([]BirthdayOccurrence, 0, len(contacts))
	for i := range contacts {
		c := &contacts[i]
		occ, ok := birthdayOccurrence(c, today)
		if !ok || occ.DaysUntil > days {
			continue
		}
		occurrences = append(occurrences, occ)
	}

	sort.Slice(occurrences, func(i, j int) bool {
		if occurrences[i].NextBirthday.Equal(occurrences[j].NextBirthday) {
			return occurrences[i].Contact.Name < occurrences[j].Contact.Name
		}
		return occurrences[i].NextBirthday.Before(occurrences[j].NextBirthday)
	})

	ptrs := make([]*model.Contact, len(occurrences))
	for i := range occurrences {
		ptrs[i] = occurrences[i].Contact
	}
	s.populateTags(ctx, workspaceID, ptrs)
	return occurrences, nil
}

// birthdayOccurrence resolves a contact's next birthday. ok=false skips
// contacts whose birthday can't be converted (shouldn't happen — lunar dates
// are clamped — but a single bad row must not break the whole list).
func birthdayOccurrence(c *model.Contact, today time.Time) (BirthdayOccurrence, bool) {
	if c.Birthday == nil {
		return BirthdayOccurrence{}, false
	}
	calendarType := lunar.NormalizeCalendar(c.BirthdayCalendar)
	next, err := lunar.NextOccurrence(*c.Birthday, calendarType, today)
	if err != nil {
		return BirthdayOccurrence{}, false
	}
	occ := BirthdayOccurrence{
		Contact:      c,
		NextBirthday: next,
		// Round, not truncate: DST can make midnight-to-midnight 23/25h.
		DaysUntil: int(math.Round(next.Sub(today).Hours() / 24)),
		Calendar:  calendarType,
		IsToday:   next.Equal(today),
	}
	// Age uses the stored (lunar or Gregorian) birth year vs the Gregorian
	// anniversary year — off by at most 1 for lunar year-end birthdays.
	if by, _, _ := c.Birthday.Date(); by >= 1900 {
		occ.AgeTurning = next.Year() - by
	}
	if calendarType == lunar.CalendarLunar {
		_, m, d := c.Birthday.Date()
		occ.LunarText = lunar.MonthDayText(int(m), d)
	}
	return occ, true
}

// CreateBirthdayReminder creates a pending reminder at 09:00 (server-local)
// on the contact's next birthday, lunar birthdays included. Returns
// ErrBirthdayReminderExists when one is already scheduled for that date.
func (s *ContactService) CreateBirthdayReminder(ctx context.Context, userID, workspaceID, contactID uint, now time.Time) (*model.Reminder, error) {
	contact, err := s.repo.GetByID(ctx, workspaceID, contactID)
	if err != nil {
		return nil, ErrContactNotFound
	}
	if contact.Birthday == nil {
		return nil, ErrContactBirthdayMissing
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	occ, ok := birthdayOccurrence(contact, today)
	if !ok {
		return nil, ErrContactBirthdayMissing
	}
	remindAt := time.Date(occ.NextBirthday.Year(), occ.NextBirthday.Month(), occ.NextBirthday.Day(), 9, 0, 0, 0, now.Location())

	if existing, _, err := s.reminderRepo.List(ctx, workspaceID, model.ReminderPending, &contactID, 1, 100); err == nil {
		for _, r := range existing {
			if sameLocalDate(r.RemindAt, remindAt) && strings.Contains(r.Title, "生日") {
				return nil, ErrBirthdayReminderExists
			}
		}
	}

	var description string
	if occ.Calendar == lunar.CalendarLunar {
		description = fmt.Sprintf("农历%s（今年公历 %s）", occ.LunarText, occ.NextBirthday.Format("2006-01-02"))
	} else {
		description = fmt.Sprintf("公历生日 %s", occ.NextBirthday.Format("2006-01-02"))
	}

	reminder := &model.Reminder{
		UserID:      userID,
		WorkspaceID: workspaceID,
		ContactID:   contactID,
		Title:       fmt.Sprintf("🎂 %s 的生日", contact.Name),
		Description: description,
		RemindAt:    remindAt,
		Status:      model.ReminderPending,
	}
	if err := s.reminderRepo.Create(ctx, reminder); err != nil {
		return nil, err
	}
	return reminder, nil
}

func sameLocalDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}
