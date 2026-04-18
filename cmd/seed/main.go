package main

import (
	"fmt"
	"log"
	"time"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/service"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/din4e/cuddlegecko/pkg/database"
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

	// Create tags
	tags := []model.Tag{
		{UserID: user.ID, Name: "重要", Color: "#ef4444"},
		{UserID: user.ID, Name: "北京", Color: "#3b82f6"},
		{UserID: user.ID, Name: "上海", Color: "#22c55e"},
		{UserID: user.ID, Name: "毛茸茸", Color: "#f59e0b"},
	}
	for i := range tags {
		db.FirstOrCreate(&tags[i], model.Tag{UserID: user.ID, Name: tags[i].Name})
	}
	fmt.Printf("Created %d tags\n", len(tags))

	// Create contacts (buddies)
	birthday := func(year, month, day int) *time.Time {
		t := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.Local)
		return &t
	}

	contacts := []model.Contact{
		{UserID: user.ID, Name: "小明", Nickname: "明明", Email: "xiaoming@example.com", Phone: "13800138001", Birthday: birthday(1995, 3, 15), Notes: "大学同学，喜欢打篮球", RelationshipLabels: []string{"friend", "colleague"}},
		{UserID: user.ID, Name: "小红", Nickname: "红红", Email: "xiaohong@example.com", Phone: "13800138002", Birthday: birthday(1998, 7, 22), RelationshipLabels: []string{"family"}},
		{UserID: user.ID, Name: "张总", Email: "zhangzong@company.com", Phone: "13800138003", RelationshipLabels: []string{"colleague", "client"}},
		{UserID: user.ID, Name: "旺财", Nickname: "旺旺", Notes: "金毛寻回犬，3岁，喜欢游泳", RelationshipLabels: []string{"pet"}},
		{UserID: user.ID, Name: "咪咪", Notes: "英短蓝猫，很黏人", RelationshipLabels: []string{"pet"}},
		{UserID: user.ID, Name: "李老师", Email: "liteacher@school.com", Phone: "13800138005", RelationshipLabels: []string{"colleague", "friend"}},
		{UserID: user.ID, Name: "王阿姨", Phone: "13800138006", RelationshipLabels: []string{"family", "friend"}},
		{UserID: user.ID, Name: "豆豆", Notes: "柯基犬，2岁，腿短但跑得快", RelationshipLabels: []string{"pet", "friend"}},
		{UserID: user.ID, Name: "陈医生", Email: "chendoctor@hospital.com", Phone: "13800138007", RelationshipLabels: []string{"client"}},
		{UserID: user.ID, Name: "大黄", Nickname: "大黄蜂", Notes: "中华田园猫，小区流浪猫，已经绝育", RelationshipLabels: []string{"pet", "other"}},
	}

	for i := range contacts {
		result := db.Where("user_id = ? AND name = ?", user.ID, contacts[i].Name).FirstOrCreate(&contacts[i])
		if result.Error != nil {
			log.Printf("Warning: contact %s: %v", contacts[i].Name, result.Error)
		}
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
	}
	fmt.Printf("Created %d relations\n", len(relations))

	fmt.Println("\nSeed data complete!")
	fmt.Println("Login: demo / test123")
}
