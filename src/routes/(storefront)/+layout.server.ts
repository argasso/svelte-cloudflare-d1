import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import * as schema from '$lib/db/schema';

export type NavNode = { id: number; label: string; href: string; children: NavNode[] };

/** Short menu label: the page's `name` field if set, else its title. */
function label(fields: unknown, title: string): string {
	if (fields && typeof fields === 'object' && 'name' in fields) {
		const name = (fields as { name?: unknown }).name;
		if (typeof name === 'string' && name.trim()) return name;
	}
	return title;
}

export const load: LayoutServerLoad = async ({ locals }) => {
	// Build the page hierarchy for navigation (pages are hierarchical metaobjects
	// linked by parentId; the URL path mirrors the nested handles).
	const pages = await locals.db
		.select({
			id: schema.metaobject.id,
			title: schema.metaobject.title,
			handle: schema.metaobject.handle,
			parentId: schema.metaobject.parentId,
			fields: schema.metaobject.fields,
			status: schema.metaobject.status
		})
		.from(schema.metaobject)
		.where(eq(schema.metaobject.type, 'page'))
		.orderBy(schema.metaobject.position, schema.metaobject.title);

	const active = pages.filter((p) => p.status === 'Active');
	const byParent = new Map<number | null, typeof active>();
	for (const p of active) {
		const list = byParent.get(p.parentId) ?? [];
		list.push(p);
		byParent.set(p.parentId, list);
	}

	const build = (parentId: number | null, parentHref: string): NavNode[] =>
		(byParent.get(parentId) ?? []).map((p) => {
			const href = `${parentHref}/${p.handle}`;
			return {
				id: p.id,
				label: label(p.fields, p.title ?? p.handle),
				href,
				children: build(p.id, href)
			};
		});

	return { nav: build(null, '') };
};
