import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Migrations are generated from `src/lib/server/db/schema.ts`. The database is
 * optional: this config is only needed when you actually run `db:*` scripts.
 *
 * Provide the connection string via the standard `DATABASE_URL` variable, e.g.
 *
 *   DATABASE_URL=postgres://user:pass@localhost:5432/disaster_monitor npm run db:push
 *
 * There is deliberately no default connection string here. Pointing tooling at
 * an implicit database is how people accidentally migrate the wrong one.
 */
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	},
	strict: true,
	verbose: true
});
