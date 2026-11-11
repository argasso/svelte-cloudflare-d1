/**
 * Storefront navigation built from the page hierarchy. parent_id is the source
 * of truth (derived from Shopify's sub_pages on import; recomputed back to
 * sub_pages on push). The top menu is the immediate children of the topmost page
 * (`startsida`), keeping it short; deeper pages are reached via dropdowns / the
 * page's own sub-page nav. URLs are hierarchical (`/<ancestor>/…/<handle>`),
 * mirroring parent_id, so they match the legacy live-site URLs — see pagePath.
 */
export type NavNode = { id: number; label: string; href: string; children: NavNode[] };

/** Minimal shape pagePath needs to walk the parent_id chain. */
type PathNode = { handle: string; parentId: number | null };

/**
 * A page's canonical URL: the chain of handles from the topmost page (excluded)
 * down to the page itself, e.g. `/information/bokserier/borja-lasa`. The root
 * page (`startsida`) itself maps to `/`. `byId` must contain every ancestor.
 */
export function pagePath(
	page: PathNode,
	byId: Map<number, PathNode>,
	rootHandle = 'startsida'
): string {
	const segments: string[] = [];
	let cur: PathNode | undefined = page;
	for (let guard = 0; cur && cur.handle !== rootHandle && guard < 20; guard++) {
		segments.unshift(cur.handle);
		cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
	}
	return '/' + segments.join('/');
}

type PageRow = {
	id: number;
	handle: string;
	title: string | null;
	status: string | null;
	parentId: number | null;
	position: number | null;
	fields: unknown;
};

/** Short menu label: the page's `name` field if set, else its title/handle. */
function label(p: PageRow): string {
	const name = (p.fields as { name?: unknown } | null)?.name;
	if (typeof name === 'string' && name.trim()) return name;
	return p.title ?? p.handle;
}

/**
 * Top-menu nodes: the topmost page's immediate children, each with their own
 * nested children (for dropdowns / the drawer).
 */
export function buildPageNav(pages: PageRow[], rootHandle = 'startsida'): NavNode[] {
	const active = pages.filter((p) => p.status === 'Active');
	const root = active.find((p) => p.handle === rootHandle);
	if (!root) return [];

	const byId = new Map<number, PageRow>(active.map((p) => [p.id, p]));
	const byParent = new Map<number | null, PageRow[]>();
	for (const p of active) {
		const list = byParent.get(p.parentId) ?? [];
		list.push(p);
		byParent.set(p.parentId, list);
	}
	for (const list of byParent.values()) {
		list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	}

	const build = (parentId: number): NavNode[] =>
		(byParent.get(parentId) ?? []).map((p) => ({
			id: p.id,
			label: label(p),
			href: pagePath(p, byId, rootHandle),
			children: build(p.id)
		}));

	return build(root.id);
}
