import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';
import { getSettings } from '$lib/server/settings';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;
	const [{ catalogue }, requests] = await Promise.all([
		getSettings(db),
		db
			.select()
			.from(schema.catalogueRequest)
			.orderBy(desc(schema.catalogueRequest.createdAt), desc(schema.catalogueRequest.id))
			.limit(200)
	]);
	return { catalogue, requests };
};
