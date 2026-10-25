-- Full-text search index across all storefront content (books, authors, pages).
-- A standalone (app-maintained) FTS5 table: the searchable text spans joins
-- (author names, variant SKUs, rich-text bodies) so it can't be a pure
-- external-content table kept by triggers — it's rebuilt/reindexed from the app.
--
-- kind:    'book' | 'author' | 'page'  (UNINDEXED — stored, not searched)
-- ref_id:  product.id or metaobject.id  (UNINDEXED)
-- handle:  slug for building the result URL  (UNINDEXED)
-- title:   the display title (searched, weighted higher via bm25)
-- body:    everything else searchable (authors/skus/description/content)
--
-- unicode61 + remove_diacritics 2 folds å/ä/ö so "bronte" matches "Brontë";
-- prefix queries (term*) give autocomplete-style matching from the app side.
CREATE VIRTUAL TABLE search_index USING fts5(
	kind UNINDEXED,
	ref_id UNINDEXED,
	handle UNINDEXED,
	title,
	body,
	tokenize = 'unicode61 remove_diacritics 2'
);
