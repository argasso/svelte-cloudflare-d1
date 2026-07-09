import { and, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { attachProductCovers } from '$lib/server/storefront/media';

/**
 * Homepage "Nyheter" and "Kommande utgivning" — derived automatically from the
 * per-variant `book.publish_month` metafield (ISO date strings, sort correctly
 * lexicographically). A product's release month = the earliest publish_month
 * across its variants. Books without publish_month don't appear in either list.
 */
async function pickProducts(
	db: Parameters<PageServerLoad>[0]['locals']['db'],
	direction: 'released' | 'upcoming',
	limit = 3
) {
	const minPm = sql<string>`min(${schema.metafield.value})`;
	const compare =
		direction === 'released'
			? sql`min(${schema.metafield.value}) <= date('now')`
			: sql`min(${schema.metafield.value}) > date('now')`;
	const order =
		direction === 'released'
			? sql`min(${schema.metafield.value}) DESC`
			: sql`min(${schema.metafield.value}) ASC`;

	return db
		.select({
			id: schema.product.id,
			title: schema.product.title,
			handle: schema.product.handle,
			description: schema.product.description,
			descriptionShort: schema.product.descriptionShort,
			publishMonth: minPm
		})
		.from(schema.product)
		.innerJoin(schema.variant, eq(schema.variant.productId, schema.product.id))
		.innerJoin(
			schema.metafield,
			and(
				eq(schema.metafield.ownerId, schema.variant.id),
				eq(schema.metafield.namespace, 'book'),
				eq(schema.metafield.key, 'publish_month')
			)
		)
		.where(eq(schema.product.status, 'Active'))
		.groupBy(schema.product.id)
		.having(compare)
		.orderBy(order)
		.limit(limit);
}

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	const [released, upcoming] = await Promise.all([
		pickProducts(db, 'released'),
		pickProducts(db, 'upcoming')
	]);

	return {
		nyheter: await attachProductCovers(db, released),
		kommande: await attachProductCovers(db, upcoming)
	};
};
