package repository

import "gorm.io/gorm"

// renumberSortOrder assigns sort_order = index-in-order for every id in a single
// statement —
//
//	UPDATE <table> SET sort_order = CASE id WHEN ? THEN ? ... ELSE sort_order END
//	WHERE id IN (...)
//
// It replaces a per-row UPDATE loop that issued one round-trip per item, which
// on SQLite's single-connection pool serialized N writes for every reorder.
//
// tx must already carry context/transaction; model selects the target table and
// its soft-delete scope. All four renumbered tables (todos, todo_items, workouts,
// workout_exercises) share the `id` primary key and `sort_order` column that the
// CASE expression references.
func renumberSortOrder(tx *gorm.DB, model any, order []uint) error {
	if len(order) == 0 {
		return nil
	}
	caseExpr := "CASE id"
	args := make([]any, 0, len(order)*2)
	for i, id := range order {
		caseExpr += " WHEN ? THEN ?"
		args = append(args, id, i)
	}
	caseExpr += " ELSE sort_order END"
	return tx.Model(model).Where("id IN ?", order).
		Update("sort_order", gorm.Expr(caseExpr, args...)).Error
}
