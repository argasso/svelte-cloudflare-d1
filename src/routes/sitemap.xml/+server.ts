import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import * as schema from '$lib/db/schema';

type Entry = { loc: string; lastmod?: string | null };

export const GET: RequestHandler = async ({ locals, url }) => {
	const db = locals.db;
	const origin = url.origin;

	const [products, pages, authors] = await Promise.all([
		db
			.select({ handle: schema.product.handle, updatedAt: schema.product.updatedAt })
			.from(schema.product)
			.where(eq(schema.product.status, 'Active')),
		db
			.select({ handle: schema.metaobject.handle, updatedAt: schema.metaobject.updatedAt })
			.from(schema.metaobject)
			.where(and(eq(schema.metaobject.type, 'page'), eq(schema.metaobject.status, 'Active'))),
		db
			.select({ handle: schema.metaobject.handle, updatedAt: schema.metaobject.updatedAt })
			.from(schema.metaobject)
			.where(and(eq(schema.metaobject.type, 'author'), eq(schema.metaobject.status, 'Active')))
	]);

	const entries: Entry[] = [
		{ loc: `${origin}/` },
		{ loc: `${origin}/bocker` },
		{ loc: `${origin}/forfattare` },
		// All pages except the home page (already listed as /)
		...pages
			.filter((p) => p.handle && p.handle !== 'startsida')
			.map((p) => ({ loc: `${origin}/${p.handle}`, lastmod: p.updatedAt })),
		...products
			.filter((p) => p.handle)
			.map((p) => ({ loc: `${origin}/bok/${p.handle}`, lastmod: p.updatedAt })),
		...authors
			.filter((a) => a.handle)
			.map((a) => ({ loc: `${origin}/forfattare/${a.handle}`, lastmod: a.updatedAt }))
	];

	const lastmod = (v?: string | null) => {
		if (!v) return '';
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? '' : `<lastmod>${d.toISOString().slice(0, 10)}</lastmod>`;
	};

	const xml =
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
		entries.map((e) => `  <url><loc>${e.loc}</loc>${lastmod(e.lastmod)}</url>`).join('\n') +
		`\n</urlset>\n`;

	return new Response(xml, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
