package main

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
)

const (
	numContacts    = 1200
	numEvents      = 20000
	numTodos       = 3000
	numInteractions = 5000
	numReminders   = 1000
	numRelations   = 3000
	batchSize      = 500
)

var (
	surnames = []string{"王", "李", "张", "刘", "陈", "杨", "赵", "黄", "周", "吴", "徐", "孙", "胡", "朱", "高", "林", "何", "郭", "马", "罗", "梁", "宋", "郑", "谢", "韩", "唐", "冯", "于", "董", "萧", "程", "曹", "袁", "邓", "许", "傅", "沈", "曾", "彭", "吕", "苏", "卢", "蒋", "蔡", "贾", "丁", "魏", "薛", "叶", "阎", "余", "潘", "杜", "戴", "夏", "钟", "汪", "田", "任", "姜", "范", "方", "石", "姚", "谭", "廖", "邹", "熊", "金", "陆", "郝", "孔", "白", "崔", "康", "毛", "邱", "秦", "江", "史", "顾", "侯", "邵", "孟", "龙", "万", "段", "雷", "钱", "汤", "尹", "黎", "易", "常", "武", "乔", "贺", "赖", "龚"}
	givenNames = []string{"伟", "芳", "娜", "秀英", "敏", "静", "丽", "强", "磊", "军", "洋", "勇", "艳", "杰", "娟", "涛", "明", "超", "秀兰", "霞", "平", "刚", "桂英", "文", "华", "建华", "玉兰", "建国", "建军", "建平", "志强", "志明", "志伟", "海燕", "海涛", "晓明", "晓红", "晓峰", "晓燕", "小红", "小明", "小刚", "小伟", "小芳", "小军", "小丽", "小强", "小雨", "子涵", "梓涵", "欣怡", "子轩", "浩然", "浩宇", "宇轩", "梓萱", "雨涵", "思涵", "可馨", "诗涵", "雅琪", "佳怡", "嘉欣", "紫萱", "语嫣", "梓豪", "浩轩", "俊熙", "子墨", "博文", "天翔", "逸飞", "鹏飞", "雪", "梅", "兰", "竹", "菊", "婷", "颖", "璐", "瑶", "佳", "倩", "琳", "蕾", "薇", "莹", "萍", "莉", "燕", "玲", "旭", "晨", "辉", "鹏", "博", "远", "峰", "斌"}
	eventTitles = []string{
		"团队周会", "项目评审", "客户拜访", "产品发布", "年度总结",
		"技术分享", "需求讨论", "代码评审", "架构设计", "面试候选人",
		"午餐聚会", "下午茶", "生日派对", "同学聚会", "团建活动",
		"培训课程", "行业峰会", "投资人会议", "商务洽谈", "签约仪式",
		"读书会", "健身", "跑步", "游泳", "羽毛球",
		"看电影", "逛街", "旅行", "拍照", "展览",
		"家庭聚餐", "家长会", "接送孩子", "看病", "体检",
		"搬家", "装修验收", "物业沟通", "缴费", "快递取件",
		"数据库优化", "服务器迁移", "系统升级", "安全审计", "备份检查",
		"需求变更评审", "Sprint回顾", "站立会议", "上线部署", "故障复盘",
		"相亲", "领证", "婚礼筹备", "婚纱照", "婚宴",
	}
	eventLocations = []string{
		"公司会议室A", "公司会议室B", "公司大会议室", "咖啡厅", "餐厅",
		"客户办公室", "会展中心", "线上会议", "公园", "健身房",
		"医院", "学校", "家里", "机场", "火车站",
		"酒店", "商场", "图书馆", "博物馆", "体育馆",
		"", "", "", "", "",
	}
	eventColors = []string{"#ef4444", "#f97316", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6", "#64748b", ""}
	interactionTypes = []model.InteractionType{"meeting", "call", "message", "email", "other"}
	todoPriorities   = []string{"low", "normal", "high"}
	todoColors       = []string{"#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", ""}
)

func main() {
	start := time.Now()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Ensure demo user exists
	hashedPassword, _ := service.HashPassword("test123")
	var user model.User
	result := db.Where("username = ?", "demo").First(&user)
	if result.Error != nil {
		user = model.User{
			Username:     "demo",
			Email:        "demo@cuddlegecko.com",
			PasswordHash: hashedPassword,
		}
		if err := db.Create(&user).Error; err != nil {
			log.Fatalf("Failed to create user: %v", err)
		}
	}
	db.Model(&user).Update("password_hash", hashedPassword)
	fmt.Printf("User: %s (id=%d)\n", user.Username, user.ID)

	// Ensure workspace exists
	var ws model.Workspace
	if err := db.Where("owner_id = ? AND name = ?", user.ID, "默认空间").FirstOrCreate(&ws, model.Workspace{
		Name:    "默认空间",
		OwnerID: user.ID,
	}).Error; err != nil {
		log.Fatalf("Failed to create workspace: %v", err)
	}
	// Ensure workspace membership
	var member model.WorkspaceMember
	if err := db.Where("workspace_id = ? AND user_id = ?", ws.ID, user.ID).FirstOrCreate(&member, model.WorkspaceMember{
		WorkspaceID: ws.ID,
		UserID:      user.ID,
		Role:        "owner",
	}).Error; err != nil {
		log.Fatalf("Failed to create workspace member: %v", err)
	}
	fmt.Printf("Workspace: %s (id=%d)\n", ws.Name, ws.ID)

	// Create tags
	tags := []model.Tag{
		{UserID: user.ID, Name: "重要", Color: "#ef4444"},
		{UserID: user.ID, Name: "北京", Color: "#3b82f6"},
		{UserID: user.ID, Name: "上海", Color: "#22c55e"},
		{UserID: user.ID, Name: "深圳", Color: "#8b5cf6"},
		{UserID: user.ID, Name: "广州", Color: "#f59e0b"},
		{UserID: user.ID, Name: "杭州", Color: "#14b8a6"},
		{UserID: user.ID, Name: "客户", Color: "#ec4899"},
		{UserID: user.ID, Name: "供应商", Color: "#6366f1"},
		{UserID: user.ID, Name: "同事", Color: "#64748b"},
		{UserID: user.ID, Name: "家人", Color: "#f97316"},
	}
	for i := range tags {
		db.FirstOrCreate(&tags[i], model.Tag{UserID: user.ID, Name: tags[i].Name})
	}
	fmt.Printf("Tags: %d\n", len(tags))

	// === Contacts ===
	fmt.Printf("\nGenerating %d contacts...\n", numContacts)
	contacts := make([]model.Contact, numContacts)
	usedNames := make(map[string]bool, numContacts)
	for i := 0; i < numContacts; i++ {
		name := uniqueName(r, usedNames)
		labels := randomLabels(r)
		contacts[i] = model.Contact{
			UserID:             user.ID,
			WorkspaceID:        ws.ID,
			Name:               name,
			Phone:              randomPhones(r),
			Email:              randomEmails(r, i),
			Notes:              "",
			RelationshipLabels: labels,
		}
		if r.Float64() < 0.3 {
			bd := randomBirthday(r)
			contacts[i].Birthday = &bd
		}
	}
	if err := db.CreateInBatches(contacts, batchSize).Error; err != nil {
		log.Fatalf("Failed to create contacts: %v", err)
	}
	// Reload IDs
	var contactIDs []uint
	db.Model(&model.Contact{}).Where("user_id = ? AND workspace_id = ?", user.ID, ws.ID).Pluck("id", &contactIDs)
	fmt.Printf("Created %d contacts (%.1fs)\n", len(contactIDs), time.Since(start).Seconds())

	// Attach tags to ~30% of contacts
	taggedCount := 0
	for i, cid := range contactIDs {
		if r.Float64() < 0.3 {
			tagCount := r.Intn(3) + 1
			picked := make([]model.Tag, 0, tagCount)
			for j := 0; j < tagCount; j++ {
				picked = append(picked, tags[r.Intn(len(tags))])
			}
			db.Model(&model.Contact{ID: cid}).Association("Tags").Replace(picked)
			taggedCount++
		}
		if i%5000 == 0 && i > 0 {
			fmt.Printf("  tagged %d/%d...\n", taggedCount, len(contactIDs))
		}
	}
	fmt.Printf("Tagged %d contacts\n", taggedCount)

	// === Events ===
	fmt.Printf("\nGenerating %d events...\n", numEvents)
	events := make([]model.Event, numEvents)
	now := time.Now()
	for i := 0; i < numEvents; i++ {
		startTime := randomTime(r, now, -365, 365)
		duration := time.Duration(r.Intn(180)+15) * time.Minute
		endTime := startTime.Add(duration)
		cids := randomContactIDs(r, contactIDs, 3)
		events[i] = model.Event{
			UserID:      user.ID,
			WorkspaceID: ws.ID,
			Title:       eventTitles[r.Intn(len(eventTitles))],
			StartTime:   startTime,
			EndTime:     &endTime,
			Location:    eventLocations[r.Intn(len(eventLocations))],
			ContactIDs:  cids,
			Color:       eventColors[r.Intn(len(eventColors))],
		}
	}
	if err := db.CreateInBatches(events, batchSize).Error; err != nil {
		log.Fatalf("Failed to create events: %v", err)
	}
	fmt.Printf("Created %d events (%.1fs)\n", numEvents, time.Since(start).Seconds())

	// === Todos ===
	fmt.Printf("\nGenerating %d todos...\n", numTodos)
	todoTitles := []string{
		"完成项目文档", "更新需求列表", "修复线上bug", "代码重构", "性能优化",
		"写单元测试", "准备演示", "整理会议纪要", "回复邮件", "提交报告",
		"联系客户确认需求", "跟进项目进度", "安排团队培训", "准备季度汇报", "审核设计稿",
		"预订餐厅", "购买办公用品", "预约体检", "缴纳水电费", "取快递",
		"备课", "批改作业", "辅导孩子功课", "整理衣柜", "打扫卫生",
		"还信用卡", "转账", "报销", "续费会员", "预约理发",
	}
	todos := make([]model.Todo, numTodos)
	for i := 0; i < numTodos; i++ {
		status := "pending"
		var completedAt *time.Time
		if r.Float64() < 0.35 {
			status = "done"
			ct := randomTime(r, now, -180, 30)
			completedAt = &ct
		}
		priority := todoPriorities[r.Intn(len(todoPriorities))]
		cids := randomContactIDs(r, contactIDs, 2)

		todo := model.Todo{
			UserID:      user.ID,
			WorkspaceID: ws.ID,
			Title:       todoTitles[r.Intn(len(todoTitles))],
			Status:      status,
			Priority:    priority,
			ContactIDs:  cids,
			Color:       todoColors[r.Intn(len(todoColors))],
			CompletedAt: completedAt,
		}
		if r.Float64() < 0.5 {
			dt := randomTime(r, now, -30, 60)
			todo.DueTime = &dt
		}
		if r.Float64() < 0.2 {
			amt := float64(r.Intn(5000) + 10)
			todo.Amount = &amt
			if r.Float64() < 0.5 {
				todo.AmountType = "income"
			} else {
				todo.AmountType = "expense"
			}
		}
		todos[i] = todo
	}
	if err := db.CreateInBatches(todos, batchSize).Error; err != nil {
		log.Fatalf("Failed to create todos: %v", err)
	}
	fmt.Printf("Created %d todos (%.1fs)\n", numTodos, time.Since(start).Seconds())

	// === Interactions ===
	fmt.Printf("\nGenerating %d interactions...\n", numInteractions)
	interContents := []string{
		"讨论了项目进展", "确认了合作细节", "聊了最近的生活", "交流了技术方案",
		"安排了下一步计划", "反馈了使用体验", "沟通了需求变更", "分享了行业动态",
	}
	interactions := make([]model.Interaction, numInteractions)
	for i := 0; i < numInteractions; i++ {
		cid := contactIDs[r.Intn(len(contactIDs))]
		interactions[i] = model.Interaction{
			UserID:     user.ID,
			ContactID:  cid,
			Type:       interactionTypes[r.Intn(len(interactionTypes))],
			Title:      eventTitles[r.Intn(len(eventTitles))],
			Content:    interContents[r.Intn(len(interContents))],
			OccurredAt: randomTime(r, now, -365, 0),
		}
	}
	if err := db.CreateInBatches(interactions, batchSize).Error; err != nil {
		log.Fatalf("Failed to create interactions: %v", err)
	}
	fmt.Printf("Created %d interactions (%.1fs)\n", numInteractions, time.Since(start).Seconds())

	// === Reminders ===
	fmt.Printf("\nGenerating %d reminders...\n", numReminders)
	reminderTitles := []string{
		"跟进客户", "准备材料", "回复消息", "提交申请", "确认预约",
		"生日提醒", "纪念日提醒", "缴费提醒", "续约提醒", "体检提醒",
	}
	reminders := make([]model.Reminder, numReminders)
	for i := 0; i < numReminders; i++ {
		status := model.ReminderStatus("pending")
		if r.Float64() < 0.3 {
			status = "done"
		}
		cid := contactIDs[r.Intn(len(contactIDs))]
		reminders[i] = model.Reminder{
			UserID:      user.ID,
			ContactID:   cid,
			Title:       reminderTitles[r.Intn(len(reminderTitles))],
			RemindAt:    randomTime(r, now, -30, 90),
			Status:      status,
		}
	}
	if err := db.CreateInBatches(reminders, batchSize).Error; err != nil {
		log.Fatalf("Failed to create reminders: %v", err)
	}
	fmt.Printf("Created %d reminders (%.1fs)\n", numReminders, time.Since(start).Seconds())

	// === Relations (edges for graph) ===
	fmt.Printf("\nGenerating %d relations...\n", numRelations)
	relationTypes := []string{"同学", "同事", "邻居", "师生", "合作伙伴", "室友", "老乡", "球友", "校友", "旅伴"}
	relations := make([]model.ContactRelation, 0, numRelations)
	usedPairs := make(map[uint64]bool, numRelations)
	for i := 0; i < numRelations; i++ {
		a := contactIDs[r.Intn(len(contactIDs))]
		b := contactIDs[r.Intn(len(contactIDs))]
		if a == b {
			continue
		}
		lo, hi := a, b
		if lo > hi {
			lo, hi = hi, lo
		}
		key := uint64(lo)<<32 | uint64(hi)
		if usedPairs[key] {
			continue
		}
		usedPairs[key] = true
		relations = append(relations, model.ContactRelation{
			UserID:       user.ID,
			WorkspaceID:  ws.ID,
			ContactIDA:   lo,
			ContactIDB:   hi,
			RelationType: relationTypes[r.Intn(len(relationTypes))],
		})
	}
	if err := db.CreateInBatches(relations, batchSize).Error; err != nil {
		log.Fatalf("Failed to create relations: %v", err)
	}
	fmt.Printf("Created %d relations (%.1fs)\n", len(relations), time.Since(start).Seconds())

	fmt.Printf("\n=== Stress seed complete! ===\n")
	fmt.Printf("Total time: %.1fs\n", time.Since(start).Seconds())
	fmt.Printf("Contacts: %d | Events: %d | Todos: %d | Interactions: %d | Reminders: %d | Relations: %d\n",
		numContacts, numEvents, numTodos, numInteractions, numReminders, len(relations))
	fmt.Println("Login: demo / test123")
}

func uniqueName(r *rand.Rand, used map[string]bool) string {
	for {
		name := surnames[r.Intn(len(surnames))] + givenNames[r.Intn(len(givenNames))]
		if !used[name] {
			used[name] = true
			return name
		}
	}
}

func randomLabels(r *rand.Rand) []string {
	all := []string{"family", "friend", "colleague", "client", "pet", "other"}
	n := r.Intn(2) + 1
	picked := make([]string, 0, n)
	perm := r.Perm(len(all))
	for i := 0; i < n; i++ {
		picked = append(picked, all[perm[i]])
	}
	return picked
}

func randomPhones(r *rand.Rand) []string {
	if r.Float64() < 0.7 {
		prefix := []string{"130", "131", "132", "133", "135", "136", "137", "138", "139",
			"150", "151", "152", "155", "156", "157", "158", "159",
			"170", "176", "177", "178", "180", "181", "182", "183", "185", "186", "187", "188", "189"}
		num := prefix[r.Intn(len(prefix))]
		for i := 0; i < 8; i++ {
			num += fmt.Sprintf("%d", r.Intn(10))
		}
		return []string{num}
	}
	return nil
}

func randomEmails(r *rand.Rand, idx int) []string {
	if r.Float64() < 0.5 {
		domains := []string{"qq.com", "163.com", "gmail.com", "outlook.com", "company.com", "126.com", "foxmail.com"}
		return []string{fmt.Sprintf("user%d@%s", idx, domains[r.Intn(len(domains))])}
	}
	return nil
}

func randomBirthday(r *rand.Rand) time.Time {
	year := 1960 + r.Intn(40)
	month := time.Month(r.Intn(12) + 1)
	day := r.Intn(28) + 1
	return time.Date(year, month, day, 0, 0, 0, 0, time.Local)
}

func randomTime(r *rand.Rand, base time.Time, minDays, maxDays int) time.Time {
	days := minDays + r.Intn(maxDays-minDays+1)
	hours := r.Intn(14) + 7 // 7:00 - 21:00
	minutes := r.Intn(12) * 5
	return base.AddDate(0, 0, days).Add(time.Duration(hours)*time.Hour + time.Duration(minutes)*time.Minute)
}

func randomContactIDs(r *rand.Rand, all []uint, max int) []uint {
	n := r.Intn(max + 1) // 0 to max
	if n == 0 {
		return nil
	}
	ids := make([]uint, n)
	for i := 0; i < n; i++ {
		ids[i] = all[r.Intn(len(all))]
	}
	return ids
}
