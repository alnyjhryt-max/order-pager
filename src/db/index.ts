import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import * as schema from "./schema";

export const db = drizzle(env.DB, { schema });

/** A drizzle query as a D1 statement, for env.DB.batch() beside raw SQL. */
export function statement(query: {
  toSQL(): { sql: string; params: unknown[] };
}): D1PreparedStatement {
  const { sql, params } = query.toSQL();
  return env.DB.prepare(sql).bind(...params);
}

/** Raw SQL with `?` parameters. */
export function rawStatement(text: string, ...params: unknown[]) {
  return env.DB.prepare(text).bind(...params);
}

/** Runs the statements as one atomic batch. */
export function batch(statements: D1PreparedStatement[]) {
  return env.DB.batch(statements);
}
