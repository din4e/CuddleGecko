package repository

// maxPageSize bounds the per-request result-set peak. It's deliberately generous
// (100000) rather than a tight ~200: ExportJSON/CSV fetch each entity's FULL set
// through these same List methods and must read every row, so a tight cap would
// silently truncate backups. The cap still prevents the catastrophic case (a
// caller requesting billions of rows) and bounds the per-request memory peak.
// NOTE: GORM's Limit is a ceiling on rows actually returned, not an allocation,
// so this bounds peak memory, not total workspace size. A tighter per-request
// bound would require capping in the service layer so export's direct repo calls
// bypass it — deferred.
const maxPageSize = 100000

// clampPage normalizes pagination: page < 1 → 1, pageSize <= 0 → 50 (default),
// and pageSize capped at maxPageSize. Every paginated List runs its page/pageSize
// through this so the bound applies at the data layer for every entry point.
func clampPage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}
