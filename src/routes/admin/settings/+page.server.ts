import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	// Media ownership progress: how many images are still served from Shopify vs
	// copied into R2. (syncEnabled comes from the admin layout load.)
	const total = await db.$count(schema.media);
	const pending = await db.$count(
		schema.media,
		and(
			or(eq(schema.media.migratedToR2, false), isNull(schema.media.migratedToR2)),
			isNotNull(schema.media.shopifyUrl)
		)
	);

	return { media: { total, owned: total - pending, pending } };
};
