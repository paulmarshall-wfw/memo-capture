import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/types.js";
import { mapUser, type AppUserRecord, type AppUserRow } from "./rows.js";

export interface UserIdentityInput {
  oidcIssuer: string;
  oidcSubject: string;
  email: string | null;
  displayName: string | null;
}

export class UserRepository {
  constructor(private readonly db: Queryable) {}

  async findByOidcIdentity(oidcIssuer: string, oidcSubject: string): Promise<AppUserRecord | null> {
    const result = await this.db.query<AppUserRow>(
      `select *
       from app_users
       where oidc_issuer = $1 and oidc_subject = $2`,
      [oidcIssuer, oidcSubject]
    );

    return result.rows[0] === undefined ? null : mapUser(result.rows[0]);
  }

  async upsertFromIdentity(input: UserIdentityInput): Promise<AppUserRecord> {
    const id = randomUUID();
    const result = await this.db.query<AppUserRow>(
      `insert into app_users (
         id,
         oidc_issuer,
         oidc_subject,
         email,
         display_name,
         first_seen_at,
         last_seen_at,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, now(), now(), now(), now())
       on conflict (oidc_issuer, oidc_subject)
       do update set
         email = excluded.email,
         display_name = excluded.display_name,
         last_seen_at = now(),
         updated_at = now()
       returning *`,
      [id, input.oidcIssuer, input.oidcSubject, input.email, input.displayName]
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to upsert app user.");
    }

    return mapUser(row);
  }
}
