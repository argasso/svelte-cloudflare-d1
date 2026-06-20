import type { PageServerLoad } from './$types';
import { readCart, resolveCart } from '$lib/server/cart';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	return { cart: await resolveCart(locals.db, readCart(cookies)) };
};
