package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/din4e/cuddlegecko/pkg/config"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// runSQLite migrates a legacy-integer SQLite database in place. SQLite's
// "id INTEGER PRIMARY KEY" is the rowid alias and cannot hold UUID text, so
// each table is rebuilt from its stored DDL with the id-ish columns widened
// to TEXT (shadow table + rename); everything else about the schema is
// preserved verbatim. Indexes die with the old table — the app's AutoMigrate
// recreates them on the next start. No wrapping transaction: the pure-Go
// SQLite driver deadlocks on DDL inside a BEGIN, so the file backup taken by
// the operator is the rollback path (same posture as the MySQL route).
func runSQLite(cfg *config.Config) {
	db, err := gorm.Open(sqlite.Open(cfg.Database.SQLitePath), &gorm.Config{})
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("raw db: %v", err)
	}
	// One connection: BEGIN and the per-table statements must share the same
	// transaction view, and a pool would hand later statements to a different
	// connection that can't see the uncommitted shadow tables.
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	specs := buildSpecs()
	if _, err := sqlDB.Exec("PRAGMA foreign_keys=OFF"); err != nil {
		log.Fatalf("pragma: %v", err)
	}

	maps := map[string]map[string]string{}
	for _, sp := range specs {
		m := map[string]string{}
		if !sp.noPK {
			rows, err := sqlDB.Query(`SELECT id FROM "` + sp.name + `"`)
			if err != nil {
				continue // table absent in this (partial) database — skip
			}
			for rows.Next() {
				var id int64
				if err := rows.Scan(&id); err != nil {
					rows.Close()
					log.Fatalf("%s: scan: %v", sp.name, err)
				}
				m[fmt.Sprint(id)] = uuid.NewString()
			}
			rows.Close()
		}
		maps[sp.name] = m
	}
	if os.Getenv("DRY_RUN") != "" {
		n := 0
		for _, sp := range specs {
			fmt.Printf("%-28s %d rows -> uuids\n", sp.name, len(maps[sp.name]))
			n += len(maps[sp.name])
		}
		fmt.Printf("DRY_RUN set: no writes performed (%d rows would change)\n", n)
		return
	}

	for _, sp := range specs {
		migrateSQLiteTable(sqlDB, sp, maps)
	}
	_, _ = sqlDB.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
	fmt.Println("done: sqlite database rewritten to UUIDs in place (single committed transaction)")
}

var sqliteIdent = regexp.MustCompile("(?i)([`\"\\[]?%s[`\"\\]]?\\s+)(integer|unsigned bigint|bigint|int)")

// migrateSQLiteTable rebuilds one table from its stored DDL with id-ish
// columns widened to TEXT, inserting rewritten rows, then swapping names.
func migrateSQLiteTable(sqlDB *sql.DB, sp tableSpec, maps map[string]map[string]string) {
	var ddl string
	if err := sqlDB.QueryRow(
		"SELECT sql FROM sqlite_master WHERE type='table' AND name = ?", sp.name,
	).Scan(&ddl); err != nil || ddl == "" {
		return // table absent — skip
	}

	rows, err := sqlDB.Query("SELECT name FROM pragma_table_info(?)", sp.name)
	if err != nil {
		return
	}
	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err == nil {
			cols = append(cols, c)
		}
	}
	rows.Close()
	colSet := map[string]bool{}
	for _, c := range cols {
		colSet[c] = true
	}

	// Which columns carry ids (and must become TEXT).
	idCols := map[string]bool{}
	if !sp.noPK {
		idCols["id"] = true
	}
	for c := range sp.refs {
		idCols[c] = true
	}
	for c := range sp.poly {
		idCols[c] = true
	}

	shadow := sp.name + "__uuid"
	newDDL := ddl
	for c := range idCols {
		if !colSet[c] {
			continue
		}
		newDDL = regexp.MustCompile(strings.ReplaceAll(sqliteIdent.String(), "%s", regexp.QuoteMeta(c))).
			ReplaceAllString(newDDL, "${1}text")
	}
	// AUTOINCREMENT is meaningless for TEXT keys.
	newDDL = regexp.MustCompile("(?i)AUTOINCREMENT").ReplaceAllString(newDDL, "")
	// Retarget the CREATE TABLE header at the shadow name (the identifier can
	// be bare, backticked or double-quoted).
	newDDL = regexp.MustCompile(`(?i)CREATE TABLE (IF NOT EXISTS )?["`+"`"+`\[]?`+regexp.QuoteMeta(sp.name)+`["`+"`"+`\]]?`).
		ReplaceAllString(newDDL, "CREATE TABLE \""+shadow+"\"")
	if _, err := sqlDB.Exec(newDDL); err != nil {
		log.Fatalf("%s: create shadow: %v (ddl=%s)", sp.name, err, newDDL)
	}

	src, err := sqlDB.Query(`SELECT * FROM "` + sp.name + `"`)
	if err != nil {
		log.Fatalf("%s: read: %v", sp.name, err)
	}
	defer src.Close()
	insert, err := sqlDB.Prepare(`INSERT INTO "` + shadow + `" ("` +
		strings.Join(cols, `", "`) + `") VALUES (` +
		strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",") + ")")
	if err != nil {
		log.Fatalf("%s: prepare insert: %v", sp.name, err)
	}
	defer insert.Close()

	n := 0
	for src.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := src.Scan(ptrs...); err != nil {
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
			log.Fatalf("%s: insert: %v", sp.name, err)
		}
		n++
	}
	src.Close()
	if _, err := sqlDB.Exec(`DROP TABLE "` + sp.name + `"`); err != nil {
		log.Fatalf("%s: drop old: %v", sp.name, err)
	}
	if _, err := sqlDB.Exec(`ALTER TABLE "` + shadow + `" RENAME TO "` + sp.name + `"`); err != nil {
		log.Fatalf("%s: rename: %v", sp.name, err)
	}
	fmt.Printf("%-28s %d rows rewritten\n", sp.name, n)
}
