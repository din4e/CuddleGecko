package service

import (
	"context"
	"errors"
	"testing"

	"github.com/din4e/cuddlegecko/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubSearchRepo struct {
	gotPattern string
	gotTypes   []string
	gotLimit   int
	hits       []model.SearchHit
	err        error
}

func (s *stubSearchRepo) Search(_ context.Context, _ uint, pattern string, types []string, limit int) ([]model.SearchHit, error) {
	s.gotPattern = pattern
	s.gotTypes = types
	s.gotLimit = limit
	return s.hits, s.err
}

func TestSearchService_Validation(t *testing.T) {
	repo := &stubSearchRepo{}
	svc := NewSearchService(repo)
	ctx := context.Background()

	_, err := svc.Search(ctx, 1, 1, "   ", nil, 0)
	assert.ErrorIs(t, err, ErrInvalidSearchQuery)

	_, err = svc.Search(ctx, 1, 1, "abc", []string{"contact", "bogus"}, 0)
	assert.ErrorIs(t, err, ErrInvalidSearchType)
	assert.Contains(t, err.Error(), "bogus")

	// Whitespace-only entries in the types list are dropped, not rejected.
	res, err := svc.Search(ctx, 1, 1, " AbC ", []string{" contact ", ""}, 0)
	require.NoError(t, err)
	assert.Equal(t, []string{"contact"}, repo.gotTypes)
	assert.Equal(t, "abc", repo.gotPattern, "query must be lowercased for the repo")
	assert.Equal(t, "AbC", res.Query, "original query echoed back")
	assert.Empty(t, res.Hits)
}

func TestSearchService_LimitClamping(t *testing.T) {
	repo := &stubSearchRepo{}
	svc := NewSearchService(repo)
	ctx := context.Background()

	_, err := svc.Search(ctx, 1, 1, "x", nil, 0)
	require.NoError(t, err)
	assert.Equal(t, DefaultSearchLimit, repo.gotLimit)

	_, err = svc.Search(ctx, 1, 1, "x", nil, 999)
	require.NoError(t, err)
	assert.Equal(t, MaxSearchLimit, repo.gotLimit)

	_, err = svc.Search(ctx, 1, 1, "x", nil, 3)
	require.NoError(t, err)
	assert.Equal(t, 3, repo.gotLimit)
}

func TestSearchService_Results(t *testing.T) {
	repo := &stubSearchRepo{
		hits: []model.SearchHit{
			{Type: model.SearchTypeContact, ID: 1, Title: "a"},
			{Type: model.SearchTypeTodo, ID: 2, Title: "b"},
		},
		err: nil,
	}
	svc := NewSearchService(repo)

	res, err := svc.Search(context.Background(), 1, 7, "q", nil, 5)
	require.NoError(t, err)
	assert.Equal(t, 2, res.Total)
	assert.Len(t, res.Hits, 2)

	repo.err = errors.New("boom")
	_, err = svc.Search(context.Background(), 1, 7, "q", nil, 5)
	assert.Error(t, err)
}
