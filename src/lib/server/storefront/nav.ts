/**
 * Storefront navigation built from the page hierarchy. The hierarchy lives in
 * each page's `sub_pages` field (Shopify metaobject references / child gids),
 * NOT in parent_id — so we resolve children by gid. The top menu is the
 * immediate children of the topmost page (`startsida`), keeping it short; deeper
 * pages are reached via dropdowns / the page's own sub-page nav. URLs are flat
 * (`/<handle>`), which all pages resolve to.
 */
export type NavNode = { id: number; label: string; href: string; children: NavNode[] };

type PageRow = {
	id: number;
	handle: string;
	title: string | null;
	status: string | null;
	shopifyId: string | null;
	fields: unknown;
};

function pageFields(fields: unknown): { name?: string | null; sub_pages?: string[] | null } {
	return (fields ?? {}) as { name?: string | null; sub_pages?: string[] | null };
}

/** Short menu label: the page's `name` field if set, else its title/handle. */
function label(p: PageRow): string {
	const name = pageFields(p.fields).name;
	if (typeof name === 'string' && name.trim()) return name;
	return p.title ?? p.handle;
}

/**
 * Build the top-menu nodes (the topmost page's immediate children, each with
 * their own nested children for dropdowns / the drawer).
 */
export function buildPageNav(pages: PageRow[], rootHandle = 'startsida'): NavNode[] {
	const active = pages.filter((p) => p.status === 'Active');
	const byGid = new Map<string, PageRow>();
	for (const p of active) if (p.shopifyId) byGid.set(p.shopifyId, p);

	const root = active.find((p) => p.handle === rootHandle);
	if (!root) return [];

	const node = (p: PageRow, seen: Set<number>): NavNode => {
		const children: NavNode[] = [];
		const subs = pageFields(p.fields).sub_pages;
		if (Array.isArray(subs)) {
			for (const gid of subs) {
				const child = byGid.get(gid);
				if (child && !seen.has(child.id)) {
					seen.add(child.id);
					children.push(node(child, seen));
				}
			}
		}
		return { id: p.id, label: label(p), href: `/${p.handle}`, children };
	};

	return node(root, new Set([root.id])).children;
}
