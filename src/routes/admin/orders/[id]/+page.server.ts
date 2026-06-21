import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals, params }) => {
	const id = parseInt(params.id);
	if (Number.isNaN(id)) error(404, 'Order not found');

	const order = await locals.db.query.order.findFirst({
		where: eq(schema.order.id, id),
		with: { items: true }
	});
	if (!order) error(404, 'Order not found');

	return { order };
};
