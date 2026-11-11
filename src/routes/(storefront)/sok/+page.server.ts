import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { searchAll } from '$lib/server/search';
import { attachCovers, attachPrices, attachProductCovers } from '$lib/server/storefront/media';
import { pagePath } from '$lib/server/storefront/nav';

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;
	const q = (url.searchParams.get('q') ?? '').trim();

	if (!q) {
		return { q: '', books: [], authors: [], pages: [], total: 0 };
	}

	const { books, authors, pages } = await searchAll(db, q, { book: 24, author: 12, page: 12 });

	// Enrich books with cover + price, authors with their portrait; pages are
	// title-only links resolved to their canonical hierarchical path.
	const [booksEnriched, authorsEnriched, allPages] = await Promise.all([
		attachPrices(db, await attachProductCovers(db, books)),
		attachCovers(db, authors, 'metaobject'),
		db
			.select({
				id: schema.metaobject.id,
				handle: schema.metaobject.handle,
				parentId: schema.metaobject.parentId
			})
			.from(schema.metaobject)
			.where(eq(schema.metaobject.type, 'page'))
	]);

	const pagesById = new Map(allPages.map((p) => [p.id, p]));
	const pagesWithHref = pages.map((p) => {
		const row = pagesById.get(p.id);
		return { ...p, href: row ? pagePath(row, pagesById) : `/${p.handle}` };
	});

	return {
		q,
		books: booksEnriched,
		authors: authorsEnriched,
		pages: pagesWithHref,
		total: books.length + authors.length + pages.length
	};
};
