package service

import (
	"context"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const didaFixture = `"Date: 2026-08-24+0000"
"Version: 7.2"
"Status: 
0 Normal
-1 Abandoned"
"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId","projectKind"
"","工作","父任务","TEXT","重要","内容A","N","2026-05-05T16:00:00+0000","2026-05-06T16:00:00+0000","","","5","0","2026-05-05T15:00:28+0000","","-100","Asia/Shanghai","true","false",,,"list","10","","TASK"
"","工作","子任务","TEXT","","","N","","","","","0","0","2026-05-05T15:01:00+0000","","-200","Asia/Shanghai","true","false",,,"list","11","10","TASK"
"","生活","已完成的","TEXT","","","N","","","","","3","2","2026-05-01T00:00:00+0000","2026-05-02T00:00:00+0000","-300","Asia/Shanghai","true","false",,,"list","12","","TASK"
"","生活","已放弃的","TEXT","","","N","","","","","0","-1","2026-05-01T00:00:00+0000","","-400","Asia/Shanghai","true","false",,,"list","13","","TASK"
"","生活","孤儿子任务","TEXT","","","N","","","","","0","0","2026-05-01T00:00:00+0000","","-500","Asia/Shanghai","true","false",,,"list","14","13","TASK"
`

// TestImportTodosFromPlatform_Dida covers the 滴答清单 CSV import: status and
// priority mapping, tag creation (tags column + list name), parent/child
// linking via taskId/parentId, abandoned-row skipping, and orphans (child of
// an abandoned parent) staying top-level.
func TestImportTodosFromPlatform_Dida(t *testing.T) {
	db := newExportTestDB(t)
	contactRepo := repository.NewContactRepo(db)
	tagRepo := repository.NewTagRepo(db)
	interactionRepo := repository.NewInteractionRepo(db)
	reminderRepo := repository.NewReminderRepo(db)
	relationRepo := repository.NewRelationRepo(db)
	todoRepo := repository.NewTodoRepo(db)

	svc := NewExportService(contactRepo, tagRepo, interactionRepo, reminderRepo, relationRepo, todoRepo, todoRepo)
	ctx := context.Background()

	res, err := svc.ImportTodosFromPlatform(ctx, 2, 3, "dida", didaFixture)
	require.NoError(t, err)
	assert.Equal(t, 4, res.Imported)
	assert.Equal(t, 1, res.Skipped, "only the abandoned task counts as skipped; its child imports top-level")

	todos, _, err := todoRepo.List(ctx, 3, model.TodoListQuery{Page: 1, PageSize: 100})
	require.NoError(t, err)
	require.Len(t, todos, 4)
	byTitle := make(map[string]model.Todo, len(todos))
	for _, td := range todos {
		byTitle[td.Title] = td
	}

	parent := byTitle["父任务"]
	assert.Equal(t, "pending", parent.Status)
	assert.Equal(t, "high", parent.Priority)
	require.NotNil(t, parent.DueTime)
	assert.Equal(t, "2026-05-06T16:00:00Z", parent.DueTime.UTC().Format("2006-01-02T15:04:05Z"))
	assert.Equal(t, "内容A", parent.Description)

	child := byTitle["子任务"]
	require.NotNil(t, child.ParentID)
	assert.Equal(t, parent.ID, *child.ParentID, "taskId 10 → parentId 10 link")

	done := byTitle["已完成的"]
	assert.Equal(t, "done", done.Status)
	require.NotNil(t, done.CompletedAt)
	assert.Equal(t, "normal", done.Priority)

	orphan := byTitle["孤儿子任务"]
	assert.Nil(t, orphan.ParentID, "parent was abandoned → stays top-level")

	// Tags: "重要" from the tags column, "工作"/"生活" list names.
	tags, _, err := tagRepo.List(ctx, 3, 1, 100)
	require.NoError(t, err)
	names := make(map[string]bool, len(tags))
	for _, tg := range tags {
		names[tg.Name] = true
	}
	assert.True(t, names["重要"])
	assert.True(t, names["工作"])
	assert.True(t, names["生活"])

	parentTags, err := todoRepo.GetTags(ctx, parent.ID)
	require.NoError(t, err)
	assert.Len(t, parentTags, 2, "tags column + list name")

	// Unknown platform is rejected before anything is written.
	_, err = svc.ImportTodosFromPlatform(ctx, 2, 3, "nope", didaFixture)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported platform")
}
