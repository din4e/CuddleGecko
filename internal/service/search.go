package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/din4e/cuddlegecko/internal/model"
)

var (
	// ErrInvalidSearchQuery is returned for a blank/whitespace-only query.
	ErrInvalidSearchQuery = errors.New("search query must not be empty")
	// ErrInvalidSearchType is returned when the types filter names an
	// unknown entity type (wrapped with the offending value).
	ErrInvalidSearchType = errors.New("unknown search type")
)

const (
	// DefaultSearchLimit is the per-entity-type hit cap when none is given.
	DefaultSearchLimit = 10
	// MaxSearchLimit caps the per-entity-type hit count; global search fans
	// out over ~11 tables, so an unbounded limit would multiply fast.
	MaxSearchLimit = 50
)

// SearchRepository is the data access surface for global search.
type SearchRepository interface {
	Search(ctx context.Context, workspaceID uint, pattern string, types []string, limit int) ([]model.SearchHit, error)
}

// SearchService fans a single query out over every workspace-scoped entity
// with user-visible text (names, notes, descriptions, contents, ...) and
// returns one merged, deduplicated hit list.
type SearchService struct {
	repo SearchRepository
}

func NewSearchService(repo SearchRepository) *SearchService {
	return &SearchService{repo: repo}
}

// Search runs the global search. types filters the entity kinds searched
// (empty = all); limit is the per-type hit cap, clamped to
// [1, MaxSearchLimit] with DefaultSearchLimit when unset.
func (s *SearchService) Search(ctx context.Context, userID, workspaceID uint, query string, types []string, limit int) (*model.SearchResults, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, ErrInvalidSearchQuery
	}

	cleaned := make([]string, 0, len(types))
	for _, t := range types {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if !model.IsSearchType(t) {
			return nil, fmt.Errorf("%w: %s", ErrInvalidSearchType, t)
		}
		cleaned = append(cleaned, t)
	}

	switch {
	case limit <= 0:
		limit = DefaultSearchLimit
	case limit > MaxSearchLimit:
		limit = MaxSearchLimit
	}

	hits, err := s.repo.Search(ctx, workspaceID, strings.ToLower(query), cleaned, limit)
	if err != nil {
		return nil, err
	}
	if hits == nil {
		hits = []model.SearchHit{}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		return hits[i].UpdatedAt.After(hits[j].UpdatedAt)
	})

	return &model.SearchResults{
		Query: query,
		Total: len(hits),
		Hits:  hits,
	}, nil
}
