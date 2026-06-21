import { desc, ne } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	// Hide abandoned pending orders (created but never paid); show real orders.
	const orders = await locals.db
		.select()
		.from(schema.order)
		.where(ne(schema.order.status, 'pending'))
		.orderBy(desc(schema.order.createdAt), desc(schema.order.id))
		.limit(100);

	return { orders };
};
