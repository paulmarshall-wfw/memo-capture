import type { ApiConfig } from "../../config.js";
import type { SharedProviderConfig } from "./types.js";

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
    const response = await fetch(`${url}/profiles/${encodeURIComponent(profile)}/providers`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(350)
    });
    if (!response.ok) {
      return {
        registry: {
          url,
          profile,
          configured: true,
          reachable: false,
          error: `Registry returned HTTP ${response.status}.`
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
