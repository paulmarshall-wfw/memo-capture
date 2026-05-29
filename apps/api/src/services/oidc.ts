import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import type { OidcConfig } from "../config.js";
import { HttpError } from "./errors.js";

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  name?: string;
}

interface JwksResponse {
  keys?: JsonWebKey[];
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string | null;
}

export class OidcTokenVerifier {
  private cachedKeys: JsonWebKey[] | null = null;

  constructor(private readonly config: OidcConfig) {}

  async verify(token: string): Promise<OidcIdentity> {
    this.assertConfigured();

    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new HttpError(401, "unauthorized", "Invalid OIDC token.");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
    const header = decodeJson<JwtHeader>(encodedHeader);
    const payload = decodeJson<JwtPayload>(encodedPayload);

    if (header.alg !== "RS256") {
      throw new HttpError(401, "unauthorized", "Unsupported OIDC token algorithm.");
    }

    this.validateClaims(payload);
    await this.verifySignature(header, `${encodedHeader}.${encodedPayload}`, encodedSignature);

    return {
      issuer: payload.iss ?? "",
      subject: payload.sub ?? "",
      email: payload.email ?? null,
      displayName: payload.name ?? null
    };
  }

  private assertConfigured(): void {
    if (
      this.config.issuerUrl.trim() === "" ||
      this.config.audience.trim() === "" ||
      this.config.jwksUrl.trim() === ""
    ) {
      throw new HttpError(500, "auth_not_configured", "OIDC validation is not configured.");
    }
  }

  private validateClaims(payload: JwtPayload): void {
    if (payload.iss !== this.config.issuerUrl) {
      throw new HttpError(401, "unauthorized", "Invalid OIDC issuer.");
    }

    if (typeof payload.sub !== "string" || payload.sub.trim() === "") {
      throw new HttpError(401, "unauthorized", "OIDC token is missing subject.");
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(this.config.audience) && !audiences.includes(this.config.clientId)) {
      throw new HttpError(401, "unauthorized", "Invalid OIDC audience.");
    }

    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new HttpError(401, "unauthorized", "OIDC token is expired.");
    }
  }

  private async verifySignature(
    header: JwtHeader,
    signingInput: string,
    encodedSignature: string
  ): Promise<void> {
    const keys = await this.getKeys();
    const key = keys.find((candidate) => candidate.kid === header.kid);

    if (key === undefined) {
      throw new HttpError(401, "unauthorized", "OIDC signing key was not found.");
    }

    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();

    const valid = verifier.verify(
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(encodedSignature, "base64url")
    );

    if (!valid) {
      throw new HttpError(401, "unauthorized", "Invalid OIDC token signature.");
    }
  }

  private async getKeys(): Promise<JsonWebKey[]> {
    if (this.cachedKeys !== null) {
      return this.cachedKeys;
    }

    const response = await fetch(this.config.jwksUrl, {
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      throw new HttpError(500, "oidc_jwks_unavailable", "OIDC JWKS endpoint is unavailable.");
    }

    const body = (await response.json()) as JwksResponse;
    this.cachedKeys = body.keys ?? [];
    return this.cachedKeys;
  }
}

function decodeJson<T>(encoded: string): T {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    throw new HttpError(401, "unauthorized", "Invalid OIDC token encoding.");
  }
}
