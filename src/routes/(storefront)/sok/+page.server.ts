import type { PageServerLoad } from './$types';
import { searchAll } from '$lib/server/search';
import { attachCovers, attachPrices, attachProductCovers } from '$lib/server/storefront/media';

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;
	const q = (url.searchParams.get('q') ?? '').trim();

	if (!q) {
		return { q: '', books: [], authors: [], pages: [], total: 0 };
	}

	const { books, authors, pages } = await searchAll(db, q, { book: 24, author: 12, page: 12 });

	// Enrich books with cover + price, authors with their portrait; pages are
	// title-only links.
	const [booksEnriched, authorsEnriched] = await Promise.all([
		attachPrices(db, await attachProductCovers(db, books)),
		attachCovers(db, authors, 'metaobject')
	]);

	return {
		q,
		books: booksEnriched,
		authors: authorsEnriched,
		pages,
		total: books.length + authors.length + pages.length
	};
};
