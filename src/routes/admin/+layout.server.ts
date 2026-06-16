import type { LayoutServerLoad } from './$types';
import { getSettings } from '$lib/server/settings';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { syncEnabled } = await getSettings(locals.db);
	return {
		user: locals.user,
		syncEnabled
	};
};
