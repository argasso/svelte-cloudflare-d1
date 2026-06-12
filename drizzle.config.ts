import { defineConfig } from 'drizzle-kit';

// Support both local development and remote D1
export default defineConfig({
	schema: './src/lib/db/schema',
	out: './migrations',
	dialect: 'sqlite',
	casing: 'snake_case',
	dbCredentials: {
		url: process.env.LOCAL_DB_PATH || 'file:.wrangler/state/v3/d1/miniflare-D1DatabaseObject/01dc6ddf3311fa4068fbc1c3c19086674a2256cdcb657426a809e6de18907723.sqlite'
	}
});
