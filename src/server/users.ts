import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { users } from "@/db/schema";

/** Records the member the first time the app sees them. */
export async function rememberUser(user: EveryAppUser): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}

export class ForbiddenError extends Error {
  status = 403;
  constructor() {
    super("Only admins can change this.");
  }
}

export function requireAdmin(user: EveryAppUser): void {
  if (!isAdmin(user)) throw new ForbiddenError();
}

export { isAdmin };
