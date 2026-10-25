import type { LayoutServerLoad } from './$types';
import { getSettings } from '$lib/server/settings';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { syncEnabled, checkoutProvider } = await getSettings(locals.db);
	return {
		user: locals.user,
		syncEnabled,
		checkoutProvider
	};
};
