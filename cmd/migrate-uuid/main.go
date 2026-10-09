// migrate-uuid rewrites every entity table's autoincrement integer primary
// keys (and all scalar/JSON/polymorphic references to them) into random UUIDs,
// in place, via the build-new-table-then-swap technique. MySQL only — the
// production database this was written for. Run against a stopped app (single
// writer), ideally right after a backup.
//
// Per table:
//  1. read all rows
//  2. mint a UUID for every old id (kept in a global old→new map per table)
//  3. CREATE TABLE <t>__uuid LIKE <t>, widening id-ish columns to CHAR(36)
//  4. insert the rewritten rows (scalar refs via the maps, JSON id arrays
//     re-serialized element-wise, polymorphic refs resolved by their type
//     discriminator column)
//  5. after every table built: RENAME TABLE <t> TO <t>__old, <t>__uuid TO <t>
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/google/uuid"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type tableSpec struct {
	name string
	// NoPK: the table is a pure join (e.g. todo_tags) whose "id" column does
	// not exist — every column is a reference instead.
	noPK bool
	// Scalar id columns and the table they reference.
	refs map[string]string
	// JSON array-of-id columns and the table they reference.
	jsonRefs map[string]string
	// Polymorphic scalar ref: column → {discriminator column, type→table}.
	poly map[string]polyRef
}

type polyRef struct {
	disc  string
	types map[string]string
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	// Raw handles, deliberately NOT database.Init: its AutoMigrate would try
	// to widen legacy integer columns that real foreign keys still reference,
	// failing before this tool can rewrite them itself.
	switch cfg.Database.Driver {
	case "mysql":
		runMySQL(cfg)
	case "sqlite":
		runSQLite(cfg)
	default:
		log.Fatal("migrate-uuid supports mysql and sqlite")
	}
}

func runMySQL(cfg *config.Config) {
	db, err := gorm.Open(mysql.Open(cfg.Database.MySQLDSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("raw db: %v", err)
	}
	db = nil // only the raw handle from here on

	specs := buildSpecs()
	maps := map[string]map[string]string{} // table → oldID → newUUID
	for _, sp := range specs {
		maps[sp.name] = readAndMint(sqlDB, sp)
	}

	if os.Getenv("DRY_RUN") != "" {
		for _, sp := range specs {
			fmt.Printf("%-28s %d rows -> uuids\n", sp.name, len(maps[sp.name]))
		}
		fmt.Println("DRY_RUN set: no writes performed")
		return
	}

	for _, sp := range specs {
		migrateTable(sqlDB, sp, maps)
	}
	for _, sp := range specs {
		swap(sqlDB, sp.name)
	}
	fmt.Printf("done: %d tables migrated. Old tables kept as <name>__old — drop them after verifying.\n", len(specs))
}

func buildSpecs() []tableSpec {
	ws := map[string]string{"workspace_id": "workspaces"}
	uid := map[string]string{"user_id": "users"}
	uidws := func(extra map[string]string) map[string]string {
		m := map[string]string{"user_id": "users"}
		for k, v := range ws {
			m[k] = v
		}
		for k, v := range extra {
			m[k] = v
		}
		return m
	}
	tagTypes := map[string]string{
		model.TagTargetContact: "contacts", model.TagTargetTodo: "todos",
		model.TagTargetWorkout: "workouts", model.TagTargetHabit: "habits",
		model.TagTargetEvent: "events", model.TagTargetTransaction: "transactions",
	}
	nodeTypes := map[string]string{
		model.NodeRefContact: "contacts", model.NodeRefTodo: "todos",
		model.NodeRefEvent: "events",
	}
	return []tableSpec{
		{name: "users"},
		{name: "workspaces", refs: map[string]string{"owner_id": "users"}},
		{name: "workspace_members", refs: uidws(nil)},
		{name: "refresh_tokens", refs: uid},
		{name: "user_settings", refs: uid},
		{name: "tags", refs: uidws(nil)},
		{name: "contacts", refs: uidws(nil)},
		{name: "contact_relations", refs: uidws(map[string]string{
			"contact_id_a": "contacts", "contact_id_b": "contacts"})},
		{name: "interactions", refs: uidws(map[string]string{"contact_id": "contacts"})},
		{name: "reminders", refs: uidws(map[string]string{"contact_id": "contacts"})},
		{name: "events", refs: uidws(nil), jsonRefs: map[string]string{"contact_ids": "contacts"}},
		{name: "todos", refs: uidws(map[string]string{"parent_id": "todos"}),
			jsonRefs: map[string]string{"contact_ids": "contacts", "todo_ids": "todos"}},
		{name: "todo_items", refs: map[string]string{"todo_id": "todos"}},
		{name: "todo_activities", refs: map[string]string{"todo_id": "todos", "user_id": "users"}},
		{name: "habits", refs: uidws(nil)},
		{name: "habit_logs", refs: uidws(map[string]string{"habit_id": "habits"})},
		{name: "pomodoro_sessions", refs: uidws(map[string]string{"todo_id": "todos"})},
		{name: "workouts", refs: uidws(nil)},
		{name: "workout_exercises", refs: map[string]string{"workout_id": "workouts"}},
		{name: "body_metrics", refs: uidws(nil)},
		{name: "exercise_library_items", refs: uidws(nil)},
		{name: "workout_templates", refs: uidws(nil)},
		{name: "workout_template_items", refs: map[string]string{"template_id": "workout_templates"}},
		{name: "workout_set_logs", refs: map[string]string{
			"workout_id": "workouts", "exercise_id": "exercise_library_items"}},
		{name: "fitness_goals", refs: uidws(nil)},
		{name: "transactions", refs: uidws(nil), jsonRefs: map[string]string{"contact_ids": "contacts"}},
		{name: "finance_snapshots", refs: uidws(nil)},
		{name: "finance_snapshot_accounts", refs: ws},
		{name: "finance_mortgages", refs: ws},
		{name: "whiteboards", refs: uidws(nil)},
		{name: "whiteboard_nodes", refs: map[string]string{"whiteboard_id": "whiteboards"},
			poly: map[string]polyRef{"ref_id": {disc: "ref_type", types: nodeTypes}}},
		{name: "whiteboard_edges", refs: map[string]string{
			"whiteboard_id": "whiteboards", "from_node_id": "whiteboard_nodes", "to_node_id": "whiteboard_nodes"}},
		{name: "a_iproviders", refs: uid},
		{name: "ai_conversations", refs: uid},
		{name: "ai_messages", refs: map[string]string{"conversation_id": "ai_conversations"}},
		{name: "taggings", refs: map[string]string{"tag_id": "tags"},
			poly: map[string]polyRef{"target_id": {disc: "target_type", types: tagTypes}}},
		{name: "todo_tags", noPK: true, refs: map[string]string{"todo_id": "todos", "tag_id": "tags"}},
	}
}

// readAndMint loads every row and mints the old→new id map for the table.
func readAndMint(db *sql.DB, sp tableSpec) map[string]string {
	if sp.noPK {
		return nil
	}
	rows, err := db.Query("SELECT id FROM `" + sp.name + "`")
	if err != nil {
		log.Fatalf("%s: read ids: %v", sp.name, err)
	}
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			log.Fatalf("%s: scan id: %v", sp.name, err)
		}
		m[fmt.Sprint(id)] = uuid.NewString()
	}
	return m
}

func mapID(maps map[string]map[string]string, table, old string) (string, bool) {
	if old == "" || old == "0" {
		return old, true
	}
	m, ok := maps[table][old]
	return m, ok
}

func migrateTable(db *sql.DB, sp tableSpec, maps map[string]map[string]string) {
	rows, err := db.Query("SELECT * FROM `" + sp.name + "`")
	if err != nil {
		log.Fatalf("%s: read: %v", sp.name, err)
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		log.Fatalf("%s: columns: %v", sp.name, err)
	}

	// Widen every id-ish column on the shadow table.
	idCols := map[string]bool{"id": !sp.noPK}
	for c := range sp.refs {
		idCols[c] = true
	}
	for c := range sp.poly {
		idCols[c] = true
	}
	alter := "ALTER TABLE `" + sp.name + "__uuid`"
	var mods []string
	for _, c := range cols {
		if idCols[c] {
			// Polymorphic ref columns (whiteboard note nodes) legitimately
			// hold NULL — only the hard keys get NOT NULL.
			null := " NOT NULL"
			if _, isPoly := sp.poly[c]; isPoly {
				null = " NULL"
			}
			mods = append(mods, "MODIFY `"+c+"` CHAR(36)"+null)
		}
	}
	if _, err := db.Exec("CREATE TABLE `" + sp.name + "__uuid` LIKE `" + sp.name + "`"); err != nil {
		log.Fatalf("%s: create shadow: %v", sp.name, err)
	}
	if len(mods) > 0 {
		if _, err := db.Exec(alter + " " + strings.Join(mods, ", ")); err != nil {
			log.Fatalf("%s: widen: %v", sp.name, err)
		}
	}

	insert, err := db.Prepare("INSERT INTO `" + sp.name + "__uuid` (" +
		"`" + strings.Join(cols, "`, `") + "`) VALUES (" + strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",") + ")")
	if err != nil {
		log.Fatalf("%s: prepare insert: %v", sp.name, err)
	}
	defer insert.Close()

	n := 0
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			log.Fatalf("%s: scan: %v", sp.name, err)
		}
		rec := map[string]any{}
		for i, c := range cols {
			rec[c] = vals[i]
		}
		rewrite(sp, rec, maps)
		out := make([]any, len(cols))
		for i, c := range cols {
			out[i] = rec[c]
		}
		if _, err := insert.Exec(out...); err != nil {
			log.Fatalf("%s: insert: %v (cols=%v)", sp.name, err, cols)
		}
		n++
	}
	fmt.Printf("%-28s %d rows rewritten\n", sp.name, n)
}

// rewrite maps ids in a single row record in place.
func rewrite(sp tableSpec, rec map[string]any, maps map[string]map[string]string) {
	// Primary key.
	if !sp.noPK {
		old := idString(rec["id"])
		if v, ok := maps[sp.name][old]; ok {
			rec["id"] = v
		}
	}
	// Scalar refs.
	for col, table := range sp.refs {
		old := idString(rec[col])
		if v, ok := mapID(maps, table, old); ok {
			rec[col] = v
		} else if old != "" {
			log.Fatalf("%s.%s: dangling ref %q -> %s", sp.name, col, old, table)
		}
	}
	// Polymorphic refs.
	for col, pr := range sp.poly {
		typ := idString(rec[pr.disc])
		table, known := pr.types[typ]
		if !known {
			continue // note-type rows carry an empty ref
		}
		old := idString(rec[col])
		if v, ok := mapID(maps, table, old); ok {
			rec[col] = v
		} else if old != "" {
			log.Fatalf("%s.%s: dangling poly ref %q (%s=%s)", sp.name, col, old, pr.disc, typ)
		}
	}
	// JSON id arrays.
	for col, table := range sp.jsonRefs {
		raw := idString(rec[col])
		if raw == "" || raw == "null" || raw == "[]" {
			continue
		}
		var ids []any
		if err := json.Unmarshal([]byte(raw), &ids); err != nil {
			log.Fatalf("%s.%s: bad json %q: %v", sp.name, col, raw, err)
		}
		out := make([]string, 0, len(ids))
		for _, id := range ids {
			s := fmt.Sprint(id)
			if v, ok := mapID(maps, table, s); ok {
				out = append(out, v)
			} else {
				log.Fatalf("%s.%s: dangling json ref %q -> %s", sp.name, col, s, table)
			}
		}
		b, _ := json.Marshal(out)
		rec[col] = string(b)
	}
}

func idString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case []byte:
		return string(t)
	case string:
		return t
	case int64:
		return fmt.Sprint(t)
	default:
		return fmt.Sprint(t)
	}
}

func swap(db *sql.DB, name string) {
	if _, err := db.Exec("RENAME TABLE `" + name + "` TO `" + name + "__old`, `" + name + "__uuid` TO `" + name + "`"); err != nil {
		log.Fatalf("%s: swap: %v", name, err)
	}
}
