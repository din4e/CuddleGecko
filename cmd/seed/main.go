package main

import (
	"fmt"
	"log"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
	"gorm.io/gorm"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	// Create test user
	hashedPassword, _ := service.HashPassword("test123")
	user := model.User{
		Username: "demo",
		Email:    "demo@cuddlegecko.com",
	}
	user.PasswordHash = hashedPassword

	if err := db.Where("username = ?", "demo").FirstOrCreate(&user).Error; err != nil {
		log.Fatalf("Failed to create user: %v", err)
	}
	// Always update password to ensure it's correct
	db.Model(&user).Update("password_hash", hashedPassword)
	fmt.Printf("User: %s (id=%d)\n", user.Username, user.ID)

	// Resolve the demo user's default workspace so every seeded entity lands in
	// it — the workspace-scoped API (and export) only sees rows in the user's
	// workspace, so leaving WorkspaceID at its 0 default orphans the data.
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		workspace = model.Workspace{Name: "Personal", OwnerID: user.ID}
		if err := db.Create(&workspace).Error; err != nil {
			log.Fatalf("Failed to create workspace: %v", err)
		}
		db.FirstOrCreate(&model.WorkspaceMember{}, model.WorkspaceMember{WorkspaceID: workspace.ID, UserID: user.ID, Role: "owner"})
	}
	wsID := workspace.ID

	// Create tags
	tags := []model.Tag{
		{UserID: user.ID, Name: "重要", Color: "#ef4444"},
		{UserID: user.ID, Name: "北京", Color: "#3b82f6"},
		{UserID: user.ID, Name: "上海", Color: "#22c55e"},
		{UserID: user.ID, Name: "毛茸茸", Color: "#f59e0b"},
	}
	for i := range tags {
		db.FirstOrCreate(&tags[i], model.Tag{UserID: user.ID, Name: tags[i].Name})
		db.Model(&tags[i]).Update("workspace_id", wsID) // fix orphaned workspace-0 rows
	}
	fmt.Printf("Created %d tags\n", len(tags))

	// Create contacts (buddies)
	birthday := func(year, month, day int) *time.Time {
		t := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.Local)
		return &t
	}

	contacts := []model.Contact{
		{UserID: user.ID, Name: "小明", Nickname: "明明", Email: []string{"xiaoming@example.com"}, Phone: []string{"13800138001"}, Birthday: birthday(1995, 3, 15), Notes: "大学同学，喜欢打篮球", RelationshipLabels: []string{"friend", "colleague"}},
		{UserID: user.ID, Name: "小红", Nickname: "红红", Email: []string{"xiaohong@example.com"}, Phone: []string{"13800138002"}, Birthday: birthday(1998, 7, 22), RelationshipLabels: []string{"family"}},
		{UserID: user.ID, Name: "张总", Email: []string{"zhangzong@company.com"}, Phone: []string{"13800138003"}, RelationshipLabels: []string{"colleague", "client"}},
		{UserID: user.ID, Name: "旺财", Nickname: "旺旺", Notes: "金毛寻回犬，3岁，喜欢游泳", RelationshipLabels: []string{"pet"}},
		{UserID: user.ID, Name: "咪咪", Notes: "英短蓝猫，很黏人", RelationshipLabels: []string{"pet"}},
		{UserID: user.ID, Name: "李老师", Email: []string{"liteacher@school.com"}, Phone: []string{"13800138005"}, RelationshipLabels: []string{"colleague", "friend"}},
		{UserID: user.ID, Name: "王阿姨", Phone: []string{"13800138006"}, RelationshipLabels: []string{"family", "friend"}},
		{UserID: user.ID, Name: "豆豆", Notes: "柯基犬，2岁，腿短但跑得快", RelationshipLabels: []string{"pet", "friend"}},
		{UserID: user.ID, Name: "陈医生", Email: []string{"chendoctor@hospital.com"}, Phone: []string{"13800138007"}, RelationshipLabels: []string{"client"}},
		{UserID: user.ID, Name: "大黄", Nickname: "大黄蜂", Notes: "中华田园猫，小区流浪猫，已经绝育", RelationshipLabels: []string{"pet", "other"}},
	}

	for i := range contacts {
		result := db.Where("user_id = ? AND name = ?", user.ID, contacts[i].Name).FirstOrCreate(&contacts[i])
		if result.Error != nil {
			log.Printf("Warning: contact %s: %v", contacts[i].Name, result.Error)
		}
		db.Model(&contacts[i]).Update("workspace_id", wsID)
	}
	fmt.Printf("Created %d buddies\n", len(contacts))

	// Attach tags to some contacts
	contacts[0].Tags = []model.Tag{tags[1], tags[0]} // 小明: 北京, 重要
	contacts[3].Tags = []model.Tag{tags[3]}           // 旺财: 毛茸茸
	contacts[4].Tags = []model.Tag{tags[3]}           // 咪咪: 毛茸茸
	contacts[7].Tags = []model.Tag{tags[3]}           // 豆豆: 毛茸茸
	for _, c := range contacts {
		if len(c.Tags) > 0 {
			db.Model(&c).Association("Tags").Replace(c.Tags)
		}
	}
	fmt.Println("Tags attached")

	// Create some interactions
	interactions := []model.Interaction{
		{UserID: user.ID, ContactID: contacts[0].ID, Type: "meeting", Title: "一起吃火锅", Content: "在三里屯吃的，聊了很多近况", OccurredAt: time.Now().Add(-48 * time.Hour)},
		{UserID: user.ID, ContactID: contacts[0].ID, Type: "message", Title: "微信聊天", Content: "讨论周末去爬山", OccurredAt: time.Now().Add(-24 * time.Hour)},
		{UserID: user.ID, ContactID: contacts[1].ID, Type: "call", Title: "打电话", Content: "问了下妈妈身体怎么样", OccurredAt: time.Now().Add(-72 * time.Hour)},
		{UserID: user.ID, ContactID: contacts[2].ID, Type: "meeting", Title: "项目会议", Content: "讨论Q2季度合作方案", OccurredAt: time.Now().Add(-12 * time.Hour)},
		{UserID: user.ID, ContactID: contacts[3].ID, Type: "other", Title: "带旺财去打疫苗", Content: "一切正常，医生说很健康", OccurredAt: time.Now().Add(-168 * time.Hour)},
		{UserID: user.ID, ContactID: contacts[5].ID, Type: "email", Title: "邮件沟通", Content: "确认下学期教学安排", OccurredAt: time.Now().Add(-96 * time.Hour)},
	}
	for _, interaction := range interactions {
		db.FirstOrCreate(&interaction, model.Interaction{
			UserID:    interaction.UserID,
			ContactID: interaction.ContactID,
			Title:     interaction.Title,
		})
		db.Model(&interaction).Update("workspace_id", wsID)
	}
	fmt.Printf("Created %d interactions\n", len(interactions))

	// Create some reminders
	reminders := []model.Reminder{
		{UserID: user.ID, ContactID: contacts[0].ID, Title: "小明生日", Description: "记得准备礼物", RemindAt: time.Now().Add(7 * 24 * time.Hour), Status: "pending"},
		{UserID: user.ID, ContactID: contacts[3].ID, Title: "旺财驱虫", Description: "每月一次体内外驱虫", RemindAt: time.Now().Add(3 * 24 * time.Hour), Status: "pending"},
		{UserID: user.ID, ContactID: contacts[4].ID, Title: "咪咪疫苗", Description: "年度疫苗加强针", RemindAt: time.Now().Add(14 * 24 * time.Hour), Status: "pending"},
		{UserID: user.ID, ContactID: contacts[2].ID, Title: "给张总发方案", Description: "把修改后的合同发过去", RemindAt: time.Now().Add(1 * 24 * time.Hour), Status: "pending"},
		{UserID: user.ID, ContactID: contacts[1].ID, Title: "给小红寄快递", Description: "答应寄的特产", RemindAt: time.Now().Add(-24 * time.Hour), Status: "done"},
	}
	for _, reminder := range reminders {
		db.FirstOrCreate(&reminder, model.Reminder{
			UserID:    reminder.UserID,
			ContactID: reminder.ContactID,
			Title:     reminder.Title,
		})
		db.Model(&reminder).Update("workspace_id", wsID)
	}
	fmt.Printf("Created %d reminders\n", len(reminders))

	// Create some relations between contacts
	relations := []model.ContactRelation{
		{UserID: user.ID, ContactIDA: contacts[0].ID, ContactIDB: contacts[5].ID, RelationType: "同学"},
		{UserID: user.ID, ContactIDA: contacts[1].ID, ContactIDB: contacts[6].ID, RelationType: "姐妹"},
		{UserID: user.ID, ContactIDA: contacts[3].ID, ContactIDB: contacts[7].ID, RelationType: "玩伴"},
		{UserID: user.ID, ContactIDA: contacts[0].ID, ContactIDB: contacts[2].ID, RelationType: "同事"},
		{UserID: user.ID, ContactIDA: contacts[4].ID, ContactIDB: contacts[9].ID, RelationType: "邻居"},
	}
	for _, rel := range relations {
		db.FirstOrCreate(&rel, model.ContactRelation{
			UserID:     rel.UserID,
			ContactIDA: rel.ContactIDA,
			ContactIDB: rel.ContactIDB,
		})
		db.Model(&rel).Update("workspace_id", wsID)
	}
	fmt.Printf("Created %d relations\n", len(relations))

	// --- Todos (TickTick-style task module) ---
	seedTodos(db, user, tags, contacts)

	// --- Transactions (finance) + Events (calendar) demo data ---
	seedTransactions(db, user, contacts)
	seedEvents(db, user, contacts)

	// --- Workouts (training plans) + Body metrics (health records) demo data ---
	seedWorkouts(db, user)
	seedBodyMetrics(db, user)

	fmt.Println("\nSeed data complete!")
	fmt.Println("Login: demo / test123")
}

// seedTodos populates the task module with a realistic spread across the smart
// lists (Today / Overdue / Next 7 days / Pending / Completed / Trash) and the
// stats surface (total / pending / overdue / deferred / done-today / done-this-week).
// It is idempotent: re-runs refresh mutable fields rather than duplicating rows.
func seedTodos(db *gorm.DB, user model.User, tags []model.Tag, contacts []model.Contact) {
	// Resolve the demo user's default workspace. The user is created above via
	// FirstOrCreate (bypassing registration), which would otherwise leave them
	// without a workspace — and every /todos, /buddies, /tags route is gated by
	// the WorkspaceAuth middleware that resolves the default workspace. Create
	// one if missing so the seeded data is actually reachable.
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		workspace = model.Workspace{Name: "Personal", OwnerID: user.ID}
		if err := db.Create(&workspace).Error; nil != err {
			log.Fatalf("Failed to create workspace: %v", err)
		}
		db.FirstOrCreate(&model.WorkspaceMember{}, model.WorkspaceMember{
			WorkspaceID: workspace.ID, UserID: user.ID, Role: "owner",
		})
	}
	wsID := workspace.ID
	fmt.Printf("Workspace: %s (id=%d)\n", workspace.Name, wsID)

	// Timestamp helpers relative to "now" so the smart lists stay meaningful.
	todayAt := func(hour, min int) *time.Time {
		n := time.Now()
		t := time.Date(n.Year(), n.Month(), n.Day(), hour, min, 0, 0, time.Local)
		return &t
	}
	relAt := func(d time.Duration) *time.Time { t := time.Now().Add(d); return &t }
	amt := func(f float64) *float64 { return &f }

	// ensureTodo creates or refreshes a todo so re-running the seed stays correct
	// (relative timestamps drift on each run, so we can't rely on FirstOrCreate
	// leaving the first-run value in place).
	ensureTodo := func(t model.Todo, tagIDs []uint) model.Todo {
		t.UserID = user.ID
		t.WorkspaceID = wsID
		if t.Status == "" {
			t.Status = "pending"
		}
		if t.Priority == "" {
			t.Priority = "normal"
		}
		db.Where("workspace_id = ? AND title = ?", wsID, t.Title).FirstOrCreate(&t)
		db.Model(&t).Updates(map[string]interface{}{
			"description":     t.Description,
			"status":          t.Status,
			"priority":        t.Priority,
			"due_time":        t.DueTime,
			"start_time":      t.StartTime,
			"pinned":          t.Pinned,
			"amount":          t.Amount,
			"amount_type":     t.AmountType,
			"color":           t.Color,
			"repeat":          t.Repeat,
			"repeat_interval": t.RepeatInterval,
			"completed_at":    t.CompletedAt,
		})
		// contact_ids uses a JSON serializer, so it must go through a model
		// instance rather than a raw map update.
		if len(t.ContactIDs) > 0 {
			db.Model(&model.Todo{}).Where("id = ?", t.ID).Updates(model.Todo{ContactIDs: t.ContactIDs})
		}
		if len(tagIDs) > 0 {
			chosen := make([]model.Tag, 0, len(tagIDs))
			for _, id := range tagIDs {
				for i := range tags {
					if tags[i].ID == id {
						chosen = append(chosen, tags[i])
						break
					}
				}
			}
			db.Model(&t).Association("Tags").Replace(chosen)
		}
		return t
	}

	ensureItem := func(todoID uint, content string, done bool, order int) {
		var item model.TodoItem
		db.Where("todo_id = ? AND content = ?", todoID, content).FirstOrCreate(&item,
			model.TodoItem{TodoID: todoID, Content: content, Done: done, SortOrder: order})
		db.Model(&item).Updates(map[string]interface{}{"done": done, "sort_order": order})
	}

	// syncItemCounts recomputes the denormalized parent progress from the actual
	// items, so the checklist counters never drift from reality.
	syncItemCounts := func(todoID uint) {
		var total, done int64
		db.Model(&model.TodoItem{}).Where("todo_id = ?", todoID).Count(&total)
		db.Model(&model.TodoItem{}).Where("todo_id = ? AND done = ?", todoID, true).Count(&done)
		db.Model(&model.Todo{}).Where("id = ?", todoID).
			Updates(map[string]interface{}{"item_total": total, "item_done": done})
	}

	tagIDs := func(ids ...uint) []uint { return ids }
	todoDefs := []struct {
		todo model.Todo
		tags []uint
	}{
		// Today + pinned, high priority.
		{model.Todo{Title: "完成季度汇报", Description: "整理 Q2 数据并提交给管理层", Priority: "high", Pinned: true, DueTime: todayAt(18, 0), Color: "#ef4444", ContactIDs: []uint{contacts[2].ID}}, tagIDs(tags[0].ID)},
		// Overdue.
		{model.Todo{Title: "给旺财洗澡", Priority: "normal", DueTime: relAt(-48 * time.Hour), ContactIDs: []uint{contacts[3].ID}}, tagIDs(tags[3].ID)},
		// Next 7 days.
		{model.Todo{Title: "订机票去上海", Priority: "high", DueTime: relAt(72 * time.Hour)}, tagIDs(tags[2].ID)},
		// Recurring daily.
		{model.Todo{Title: "每日站会", Priority: "normal", Repeat: "daily", DueTime: todayAt(9, 30)}, nil},
		// Recurring weekly.
		{model.Todo{Title: "每周复盘周报", Priority: "normal", Repeat: "weekly", DueTime: relAt(5 * 24 * time.Hour)}, nil},
		// Recurring weekdays.
		{model.Todo{Title: "健身房锻炼", Priority: "low", Repeat: "weekdays", DueTime: todayAt(19, 0)}, nil},
		// Finance-linked (expense amount).
		{model.Todo{Title: "缴房租", Description: "本月房租", Priority: "high", Amount: amt(3500), AmountType: "expense", DueTime: relAt(5 * 24 * time.Hour)}, tagIDs(tags[1].ID)},
		// Parent with a partially-done checklist.
		{model.Todo{Title: "读完《设计模式》", Priority: "normal", DueTime: relAt(10 * 24 * time.Hour)}, nil},
		// Parent with an untouched checklist.
		{model.Todo{Title: "准备小红生日聚会", Priority: "normal", DueTime: relAt(6 * 24 * time.Hour), ContactIDs: []uint{contacts[1].ID}}, tagIDs(tags[0].ID)},
		// Deferred (future start_time) — hidden from actionable views, counted in stats.
		{model.Todo{Title: "学习 Rust 新语言", Priority: "low", StartTime: relAt(10 * 24 * time.Hour)}, nil},
		// Done today.
		{model.Todo{Title: "整理上月报销", Priority: "normal", Status: "done", CompletedAt: relAt(-2 * time.Hour)}, nil},
		// Done this week.
		{model.Todo{Title: "回复客户邮件", Priority: "high", Status: "done", CompletedAt: relAt(-3 * 24 * time.Hour)}, nil},
		// Done (older, outside this week).
		{model.Todo{Title: "周末大采购", Priority: "low", Status: "done", CompletedAt: relAt(-30 * 24 * time.Hour)}, nil},
	}

	created := make([]model.Todo, len(todoDefs))
	for i, d := range todoDefs {
		created[i] = ensureTodo(d.todo, d.tags)
	}
	fmt.Printf("Created %d todos\n", len(todoDefs))

	byTitle := func(title string) model.Todo {
		for _, t := range created {
			if t.Title == title {
				return t
			}
		}
		return model.Todo{}
	}

	// Checklists (subtasks) — progress counters synced from the real rows.
	book := []struct {
		content string
		done    bool
	}{
		{"通读第一部分", true},
		{"整理章节笔记", true},
		{"动手实现示例代码", false},
	}
	for i, it := range book {
		ensureItem(byTitle("读完《设计模式》").ID, it.content, it.done, i)
	}
	syncItemCounts(byTitle("读完《设计模式》").ID)

	party := []struct {
		content string
		done    bool
	}{
		{"预定餐厅", false},
		{"订购生日蛋糕", false},
		{"邀请朋友参加", false},
	}
	for i, it := range party {
		ensureItem(byTitle("准备小红生日聚会").ID, it.content, it.done, i)
	}
	syncItemCounts(byTitle("准备小红生日聚会").ID)
	fmt.Println("Todo subtasks attached")

	// One trashed todo so the Trash smart list isn't empty. Hard-remove any prior
	// same-title row (including soft-deleted ones) first so re-runs don't stack up.
	const trashTitle = "旧的废弃任务（示例）"
	db.Unscoped().Where("workspace_id = ? AND title = ?", wsID, trashTitle).Delete(&model.Todo{})
	trash := model.Todo{UserID: user.ID, WorkspaceID: wsID, Title: trashTitle, Priority: "low"}
	if err := db.Create(&trash).Error; err == nil {
		db.Delete(&trash) // soft-delete -> surfaces under /todos/trash
	}
	fmt.Println("Trashed todo created")
}

// seedTransactions adds a few income/expense demo transactions (finance module),
// some linked to buddies. Idempotent on (workspace, title).
func seedTransactions(db *gorm.DB, user model.User, contacts []model.Contact) {
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		return
	}
	wsID := workspace.ID
	rel := func(daysAgo int) time.Time { return time.Now().AddDate(0, 0, -daysAgo) }
	txs := []model.Transaction{
		{UserID: user.ID, WorkspaceID: wsID, Title: "工资", Amount: 12000, Type: "income", Category: "工资", Date: rel(2)},
		{UserID: user.ID, WorkspaceID: wsID, Title: "理财收益", Amount: 450, Type: "income", Category: "理财", Date: rel(10)},
		{UserID: user.ID, WorkspaceID: wsID, Title: "房租", Amount: 3500, Type: "expense", Category: "住房", Date: rel(3), ContactIDs: []uint{contacts[2].ID}},
		{UserID: user.ID, WorkspaceID: wsID, Title: "聚餐", Amount: 320, Type: "expense", Category: "餐饮", Date: rel(5), ContactIDs: []uint{contacts[0].ID}},
		{UserID: user.ID, WorkspaceID: wsID, Title: "宠物打疫苗", Amount: 200, Type: "expense", Category: "宠物", Date: rel(7), ContactIDs: []uint{contacts[3].ID}},
	}
	for i := range txs {
		db.FirstOrCreate(&txs[i], model.Transaction{WorkspaceID: wsID, Title: txs[i].Title})
	}
	fmt.Printf("Created %d transactions\n", len(txs))
}

// seedEvents adds a few demo calendar events (events module), some linked to
// buddies. Idempotent on (workspace, title).
func seedEvents(db *gorm.DB, user model.User, contacts []model.Contact) {
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		return
	}
	wsID := workspace.ID
	at := func(offsetDays, hour int) time.Time {
		n := time.Now()
		return time.Date(n.Year(), n.Month(), n.Day(), hour, 0, 0, 0, time.Local).AddDate(0, 0, offsetDays)
	}
	endPlus := func(start time.Time, hours int) *time.Time { e := start.Add(time.Duration(hours) * time.Hour); return &e }

	s1 := at(1, 10)
	s2 := at(3, 19)
	s3 := at(7, 14)
	events := []model.Event{
		{UserID: user.ID, WorkspaceID: wsID, Title: "项目评审会", StartTime: s1, EndTime: endPlus(s1, 1), Location: "会议室A", Color: "#3b82f6", ContactIDs: []uint{contacts[2].ID}},
		{UserID: user.ID, WorkspaceID: wsID, Title: "和小明看电影", StartTime: s2, Location: "万达影城", Color: "#22c55e", ContactIDs: []uint{contacts[0].ID}},
		{UserID: user.ID, WorkspaceID: wsID, Title: "带旺财体检", StartTime: s3, Location: "宠物医院", Color: "#f59e0b", ContactIDs: []uint{contacts[3].ID}},
	}
	for i := range events {
		db.FirstOrCreate(&events[i], model.Event{WorkspaceID: wsID, Title: events[i].Title})
	}
	fmt.Printf("Created %d events\n", len(events))
}

// seedWorkouts adds a few demo training plans with exercise checklists (fitness
// module), spanning statuses so the stats surface has something to show.
// Idempotent on (workspace, name).
func seedWorkouts(db *gorm.DB, user model.User) {
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		return
	}
	wsID := workspace.ID

	iptr := func(v int) *int { return &v }
	fptr := func(v float64) *float64 { return &v }
	at := func(offsetDays, hour int) *time.Time {
		n := time.Now()
		t := time.Date(n.Year(), n.Month(), n.Day(), hour, 0, 0, 0, time.Local).AddDate(0, 0, offsetDays)
		return &t
	}
	completedAt := func(offsetDays int) *time.Time {
		t := time.Now().AddDate(0, 0, -offsetDays)
		return &t
	}

	type exDef struct {
		name string
		sets *int
		reps *int
		weight *float64
		distance *float64
		duration *int
		done bool
	}
	type workoutDef struct {
		w          model.Workout
		exercises  []exDef
	}
	defs := []workoutDef{
		{
			w: model.Workout{Name: "晨跑 5 公里", Type: "cardio", Status: model.WorkoutStatusCompleted,
				Intensity: "medium", ScheduledAt: at(-2, 7), DurationMin: iptr(32), Calories: fptr(320),
				Color: "#22c55e", Location: "奥林匹克森林公园", CompletedAt: completedAt(2)},
			exercises: []exDef{
				{name: "跑步", distance: fptr(5), duration: iptr(1800), done: true},
				{name: "拉伸放松", duration: iptr(300), done: true},
			},
		},
		{
			w: model.Workout{Name: "上肢力量训练", Type: "strength", Status: model.WorkoutStatusPlanned,
				Intensity: "high", ScheduledAt: at(1, 19), DurationMin: iptr(60), Calories: fptr(0),
				Color: "#ef4444", Location: "健身房"},
			exercises: []exDef{
				{name: "卧推", sets: iptr(4), reps: iptr(8), weight: fptr(60), done: false},
				{name: "引体向上", sets: iptr(4), reps: iptr(6), done: false},
				{name: "哑铃弯举", sets: iptr(3), reps: iptr(12), weight: fptr(12), done: false},
			},
		},
		{
			w: model.Workout{Name: "瑜伽拉伸", Type: "flexibility", Status: model.WorkoutStatusInProgress,
				Intensity: "low", ScheduledAt: at(0, 21), DurationMin: iptr(45), Color: "#8b5cf6", Location: "家中"},
			exercises: []exDef{
				{name: "下犬式", duration: iptr(60), done: true},
				{name: "战士一式", duration: iptr(60), done: false},
			},
		},
	}

	ensureWorkout := func(def workoutDef) model.Workout {
		w := def.w
		w.UserID = user.ID
		w.WorkspaceID = wsID
		db.Where("workspace_id = ? AND name = ?", wsID, w.Name).FirstOrCreate(&w)
		db.Model(&w).Updates(map[string]interface{}{
			"type": w.Type, "status": w.Status, "intensity": w.Intensity, "scheduled_at": w.ScheduledAt,
			"duration_min": w.DurationMin, "calories": w.Calories, "color": w.Color, "location": w.Location,
			"completed_at": w.CompletedAt,
		})
		return w
	}
	ensureExercise := func(workoutID uint, e exDef, order int) {
		var ex model.WorkoutExercise
		db.Where("workout_id = ? AND name = ?", workoutID, e.name).FirstOrCreate(&ex,
			model.WorkoutExercise{WorkoutID: workoutID, Name: e.name, SortOrder: order})
		db.Model(&ex).Updates(map[string]interface{}{
			"sets": e.sets, "reps": e.reps, "weight": e.weight, "distance": e.distance,
			"duration_sec": e.duration, "done": e.done, "sort_order": order,
		})
	}
	syncWorkoutCounts := func(workoutID uint) {
		var total, done int64
		db.Model(&model.WorkoutExercise{}).Where("workout_id = ?", workoutID).Count(&total)
		db.Model(&model.WorkoutExercise{}).Where("workout_id = ? AND done = ?", workoutID, true).Count(&done)
		db.Model(&model.Workout{}).Where("id = ?", workoutID).
			Updates(map[string]interface{}{"item_total": total, "item_done": done})
	}

	for _, def := range defs {
		w := ensureWorkout(def)
		for i, e := range def.exercises {
			ensureExercise(w.ID, e, i)
		}
		syncWorkoutCounts(w.ID)
	}
	fmt.Printf("Created %d workouts\n", len(defs))
}

// seedBodyMetrics adds a short history of body/health records so the trend chart
// and summary have data. Idempotent on (workspace, recorded_at).
func seedBodyMetrics(db *gorm.DB, user model.User) {
	var workspace model.Workspace
	if err := db.Where("owner_id = ?", user.ID).Order("created_at ASC").First(&workspace).Error; err != nil {
		return
	}
	wsID := workspace.ID

	fptr := func(v float64) *float64 { return &v }
	iptr := func(v int) *int { return &v }
	day := func(daysAgo int, hour int) time.Time {
		n := time.Now()
		return time.Date(n.Year(), n.Month(), n.Day(), hour, 0, 0, 0, time.Local).AddDate(0, 0, -daysAgo)
	}

	records := []model.BodyMetric{
		{UserID: user.ID, WorkspaceID: wsID, RecordedAt: day(28, 9), Weight: fptr(72.5), Height: fptr(175), BodyFat: fptr(20.1), RestingHR: iptr(68), SleepHours: fptr(7), Energy: iptr(3), Mood: iptr(3)},
		{UserID: user.ID, WorkspaceID: wsID, RecordedAt: day(21, 9), Weight: fptr(72.1), Height: fptr(175), BodyFat: fptr(19.7), RestingHR: iptr(67), SleepHours: fptr(7.5), Steps: iptr(9000), Energy: iptr(4), Mood: iptr(4)},
		{UserID: user.ID, WorkspaceID: wsID, RecordedAt: day(14, 9), Weight: fptr(71.6), Height: fptr(175), BodyFat: fptr(19.2), MuscleMass: fptr(31.5), RestingHR: iptr(66), Systolic: iptr(118), Diastolic: iptr(78), SleepHours: fptr(6.5), Steps: iptr(11000), Energy: iptr(4), Mood: iptr(4)},
		{UserID: user.ID, WorkspaceID: wsID, RecordedAt: day(7, 9), Weight: fptr(71.2), Height: fptr(175), BodyFat: fptr(18.8), MuscleMass: fptr(31.8), RestingHR: iptr(65), Systolic: iptr(116), Diastolic: iptr(76), SleepHours: fptr(8), Steps: iptr(12000), Energy: iptr(5), Mood: iptr(4)},
		{UserID: user.ID, WorkspaceID: wsID, RecordedAt: day(1, 9), Weight: fptr(70.9), Height: fptr(175), BodyFat: fptr(18.5), MuscleMass: fptr(32.0), RestingHR: iptr(64), Systolic: iptr(115), Diastolic: iptr(75), SleepHours: fptr(7.5), Steps: iptr(8500), Energy: iptr(4), Mood: iptr(5)},
	}
	for i := range records {
		db.FirstOrCreate(&records[i], model.BodyMetric{WorkspaceID: wsID, RecordedAt: records[i].RecordedAt})
	}
	fmt.Printf("Created %d body metrics\n", len(records))
}
