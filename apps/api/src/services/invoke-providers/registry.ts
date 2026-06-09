import type { ApiConfig } from "../../config.js";
import type { SharedProviderConfig, SharedRegistryProfile } from "./types.js";

export interface RegistryProviderSnapshot {
  registry: {
    url: string;
    profile: string;
    configured: boolean;
    reachable: boolean;
    error: string | null;
  };
  providers: SharedProviderConfig[];
}

export async function fetchRegistryProviders(config: ApiConfig): Promise<RegistryProviderSnapshot> {
  const url = config.invokeProviders.registryUrl.trim().replace(/\/$/, "");
  const profile = config.invokeProviders.profile.trim();
  if (url === "" || profile === "") {
    return {
      registry: {
        url,
        profile,
        configured: false,
        reachable: false,
        error: "Registry URL and profile must both be configured."
      },
      providers: []
    };
  }

  try {
    const response = await fetchRegistryJson(url, `/profiles/${encodeURIComponent(profile)}/providers`);
    if (!response.ok) {
      const errorMessage = await readRegistryError(response);
      return {
        registry: {
          url,
          profile,
          configured: true,
          reachable: false,
          error: errorMessage ?? `Registry returned HTTP ${response.status}.`
        },
        providers: []
      };
    }
    const payload = await response.json() as unknown;
    return {
      registry: {
        url,
        profile,
        configured: true,
        reachable: true,
        error: null
      },
      providers: parseRegistryProviders(payload)
    };
  } catch (error) {
    return {
      registry: {
        url,
        profile,
        configured: true,
        reachable: false,
        error: error instanceof Error ? error.message : String(error)
      },
      providers: []
    };
  }
}

export async function fetchRegistryProfiles(config: ApiConfig): Promise<{
  registry: {
    url: string;
    configured: boolean;
    reachable: boolean;
    error: string | null;
  };
  profiles: SharedRegistryProfile[];
}> {
  const url = config.invokeProviders.registryUrl.trim().replace(/\/$/, "");
  if (url === "") {
    return {
      registry: {
        url,
        configured: false,
        reachable: false,
        error: "Registry URL must be configured."
      },
      profiles: []
    };
  }
  try {
    const response = await fetchRegistryJson(url, "/profiles");
    if (!response.ok) {
      return {
        registry: {
          url,
          configured: true,
          reachable: false,
          error: (await readRegistryError(response)) ?? `Registry returned HTTP ${response.status}.`
        },
        profiles: []
      };
    }
    return {
      registry: {
        url,
        configured: true,
        reachable: true,
        error: null
      },
      profiles: parseRegistryProfiles(await response.json() as unknown)
    };
  } catch (error) {
    return {
      registry: {
        url,
        configured: true,
        reachable: false,
        error: error instanceof Error ? error.message : String(error)
      },
      profiles: []
    };
  }
}

export async function fetchRegistryProfile(config: ApiConfig, profileKey: string): Promise<{
  ok: boolean;
  missing: boolean;
  profile: SharedRegistryProfile | null;
  error: string | null;
}> {
  const url = config.invokeProviders.registryUrl.trim().replace(/\/$/, "");
  if (url === "") {
    return { ok: false, missing: false, profile: null, error: "Registry URL must be configured." };
  }
  try {
    const response = await fetchRegistryJson(url, `/profiles/${encodeURIComponent(profileKey)}`);
    if (!response.ok) {
      const errorMessage = await readRegistryError(response);
      return {
        ok: false,
        missing: response.status === 404 || errorMessage?.includes("missing_profile") === true,
        profile: null,
        error: errorMessage ?? `Registry returned HTTP ${response.status}.`
      };
    }
    return {
      ok: true,
      missing: false,
      profile: parseRegistryProfile(await response.json() as unknown),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      missing: false,
      profile: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseRegistryProviders(payload: unknown): SharedProviderConfig[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.flatMap((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const providerKind = parseProviderKind(record.providerKind);
    const providerKey = stringValue(record.providerKey);
    const adapterKey = stringValue(record.adapterKey);
    const displayName = stringValue(record.displayName);
    if (providerKind === null || providerKey === null || adapterKey === null || displayName === null) {
      return [];
    }
    const provider: SharedProviderConfig = {
      providerKind,
      providerKey,
      adapterKey,
      displayName,
      enabled: record.enabled === true,
      externalSend: record.externalSend === true,
      capabilities: []
    };
    const baseUrl = stringValue(record.baseUrl);
    if (baseUrl !== null) {
      provider.baseUrl = baseUrl;
    }
    const model = stringValue(record.model);
    if (model !== null) {
      provider.model = model;
    }
    const requiredSecretRef = stringValue(record.requiredSecretRef);
    if (requiredSecretRef !== null) {
      provider.requiredSecretRef = requiredSecretRef;
    }
    const health = parseHealth(record.health);
    if (health !== null) {
      provider.health = health;
    }
    if (Array.isArray(record.capabilities)) {
      provider.capabilities = record.capabilities.flatMap((capability) => {
        if (capability === null || typeof capability !== "object" || Array.isArray(capability)) {
          return [];
        }
        const capabilityRecord = capability as Record<string, unknown>;
        const key = stringValue(capabilityRecord.key);
        const name = stringValue(capabilityRecord.displayName) ?? key;
        if (!isCapabilityKey(key) || name === null) {
          return [];
        }
        return [{ key, displayName: name }];
      });
    }
    return [provider];
  });
}

function parseRegistryProfiles(payload: unknown): SharedRegistryProfile[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.flatMap((entry) => {
    const profile = parseRegistryProfile(entry);
    return profile === null ? [] : [profile];
  });
}

function parseRegistryProfile(payload: unknown): SharedRegistryProfile | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const profileKey = stringValue(record.profileKey);
  const displayName = stringValue(record.displayName);
  if (profileKey === null || displayName === null) {
    return null;
  }
  const profile: SharedRegistryProfile = { profileKey, displayName };
  const description = stringValue(record.description);
  if (description !== null) {
    profile.description = description;
  }
  return profile;
}

function parseProviderKind(value: unknown): SharedProviderConfig["providerKind"] | null {
  return value === "llm" || value === "stt" || value === "tts" || value === "ocr" || value === "module"
    ? value
    : null;
}

function parseHealth(value: unknown): NonNullable<SharedProviderConfig["health"]> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== "unknown" && status !== "healthy" && status !== "degraded" && status !== "unhealthy") {
    return null;
  }
  const health: NonNullable<SharedProviderConfig["health"]> = { status };
  const checkedAt = stringValue(record.checkedAt);
  if (checkedAt !== null) {
    health.checkedAt = checkedAt;
  }
  const detail = stringValue(record.detail);
  if (detail !== null) {
    health.detail = detail;
  }
  return health;
}

function isCapabilityKey(value: string | null): value is SharedProviderConfig["capabilities"][number]["key"] {
  return (
    value === "llm.generateText" ||
    value === "llm.generateJson" ||
    value === "stt.transcribe" ||
    value === "tts.synthesize" ||
    value === "ocr.extractText" ||
    value === "module.runDeterministic"
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function fetchRegistryJson(url: string, path: string): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(350)
  });
}

async function readRegistryError(response: Response): Promise<string | null> {
  try {
    const payload = await response.json() as unknown;
    if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      const errorClass = stringValue(record.errorClass);
      const message = stringValue(record.message);
      if (errorClass !== null && message !== null) {
        return `${errorClass}: ${message}`;
      }
      return message ?? errorClass;
    }
  } catch {
    // Ignore non-JSON registry errors; callers fall back to HTTP status text.
  }
  return null;
}
