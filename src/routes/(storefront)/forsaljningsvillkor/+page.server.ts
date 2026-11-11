import type { PageServerLoad } from './$types';
import { loadPolicy } from '$lib/server/storefront/policy';

export const load: PageServerLoad = async ({ locals }) => {
	const { bodyHtml } = await loadPolicy(locals.db, 'termsOfService');
	return { heading: 'Försäljningsvillkor', bodyHtml };
};
