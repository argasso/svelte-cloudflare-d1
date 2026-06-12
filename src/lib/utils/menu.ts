import { isPage, type Metaobject } from '$lib/db/schema';

export type MenuItem = {
	id: number;
	href: string;
	name: string;
	parent?: MenuItem;
	children: MenuItem[];
};

/**
 * Build menu tree from D1 metaobject data
 * Converts hierarchical metaobjects (pages) into menu structure
 */
export function makeMenu(
	metaobject: Metaobject & { children?: Metaobject[] },
	parent?: MenuItem
): MenuItem | undefined {
	if (!metaobject) return undefined;

	const id = metaobject.id;
	const name =
		metaobject.fields?.name ??
		(isPage(metaobject) ? metaobject.fields?.title : undefined) ??
		metaobject.title ??
		metaobject.handle;
	const href = parent ? `${parent.href === '/' ? '' : parent.href}/${metaobject.handle}` : '/';

	const item: MenuItem = { id, name, href, parent, children: [] };

	// Recursively build children
	if (metaobject.children && metaobject.children.length > 0) {
		item.children = metaobject.children
			.map((child) => makeMenu(child, item))
			.filter((c): c is MenuItem => c !== undefined);
	}

	return item;
}

/**
 * Find a menu item by its href path
 */
export function findMenuItem(menu: MenuItem | undefined, path: string): MenuItem | undefined {
	if (!menu) return undefined;

	if (menu.href === path) {
		return menu;
	}

	for (const child of menu.children) {
		const match = findMenuItem(child, path);
		if (match) return match;
	}

	return undefined;
}

/**
 * Get breadcrumb path to a menu item
 */
export function getPathToItem(item: MenuItem | undefined): MenuItem[] {
	if (!item) return [];
	if (item.parent) {
		return [...getPathToItem(item.parent), item];
	}
	return [item];
}

/**
 * Flatten menu tree into array
 */
export function flatten(item: MenuItem | undefined): MenuItem[] {
	if (!item) return [];
	if (item.children && item.children.length > 0) {
		return [item, ...item.children.flatMap((c) => flatten(c))];
	}
	return [item];
}
