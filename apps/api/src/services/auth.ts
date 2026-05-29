import type { ApiConfig } from "../config.js";
import type { UserRepository } from "../repositories/users.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { HttpError } from "./errors.js";
import { OidcTokenVerifier, type OidcIdentity } from "./oidc.js";

export interface AuthenticatedSession {
  user: AppUserRecord;
  authMode: "oidc" | "local-dev";
  isAdmin: true;
}

export class AuthService {
  private readonly oidcVerifier: OidcTokenVerifier;

  constructor(
    private readonly config: ApiConfig,
    private readonly users: UserRepository
  ) {
    this.oidcVerifier = new OidcTokenVerifier(config.oidc);
  }

  async createLocalDevSession(): Promise<AuthenticatedSession & { accessToken: string }> {
    if (!this.config.localDevAuth.enabled) {
      throw new HttpError(404, "not_found", "Local-dev auth is not enabled.");
    }

    const user = await this.users.upsertFromIdentity({
      oidcIssuer: this.config.localDevAuth.issuer,
      oidcSubject: this.config.localDevAuth.subject,
      email: this.config.localDevAuth.email,
      displayName: this.config.localDevAuth.displayName
    });

    return {
      user,
      authMode: "local-dev",
      isAdmin: true,
      accessToken: this.createLocalDevToken()
    };
  }

  async authenticateAuthorizationHeader(header: string | undefined): Promise<AuthenticatedSession> {
    const token = parseBearerToken(header);
    if (token === null) {
      throw new HttpError(401, "unauthorized", "Missing bearer token.");
    }

    if (this.config.authMode === "local-dev") {
      return this.authenticateLocalDevToken(token);
    }

    return this.authenticateOidcToken(token);
  }

  private async authenticateLocalDevToken(token: string): Promise<AuthenticatedSession> {
    if (!this.config.localDevAuth.enabled || token !== this.createLocalDevToken()) {
      throw new HttpError(401, "unauthorized", "Invalid local-dev token.");
    }

    const user = await this.users.upsertFromIdentity({
      oidcIssuer: this.config.localDevAuth.issuer,
      oidcSubject: this.config.localDevAuth.subject,
      email: this.config.localDevAuth.email,
      displayName: this.config.localDevAuth.displayName
    });

    return {
      user,
      authMode: "local-dev",
      isAdmin: true
    };
  }

  private async authenticateOidcToken(token: string): Promise<AuthenticatedSession> {
    const identity = await this.oidcVerifier.verify(token);
    const user = await this.users.upsertFromIdentity(identityToUserInput(identity));

    return {
      user,
      authMode: "oidc",
      isAdmin: true
    };
  }

  private createLocalDevToken(): string {
    return `local-dev:${this.config.localDevAuth.issuer}:${this.config.localDevAuth.subject}`;
  }
}

function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() === "" ? null : match?.[1] ?? null;
}

function identityToUserInput(identity: OidcIdentity) {
  return {
    oidcIssuer: identity.issuer,
    oidcSubject: identity.subject,
    email: identity.email,
    displayName: identity.displayName
  };
}
