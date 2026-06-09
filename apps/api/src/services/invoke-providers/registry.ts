import { RegistryClientError, RemoteRegistryClient } from "@invoke-providers/client";
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
  const url = registryUrl(config);
  const profile = registryProfile(config);
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
    const providers = await registryClient(url, profile).listProviders();
    return {
      registry: {
        url,
        profile,
        configured: true,
        reachable: true,
        error: null
      },
      providers
    };
  } catch (error) {
    return {
      registry: {
        url,
        profile,
        configured: true,
        reachable: false,
        error: registryErrorMessage(error)
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
  const url = registryUrl(config);
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
    const profiles = await registryClient(url, registryProfile(config) || "default").listProfiles();
    return {
      registry: {
        url,
        configured: true,
        reachable: true,
        error: null
      },
      profiles
    };
  } catch (error) {
    return {
      registry: {
        url,
        configured: true,
        reachable: false,
        error: registryErrorMessage(error)
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
  const url = registryUrl(config);
  if (url === "") {
    return { ok: false, missing: false, profile: null, error: "Registry URL must be configured." };
  }
  try {
    return {
      ok: true,
      missing: false,
      profile: await registryClient(url, profileKey).getProfile(profileKey),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      missing: error instanceof RegistryClientError && error.errorClass === "missing_profile",
      profile: null,
      error: registryErrorMessage(error)
    };
  }
}

function registryClient(url: string, profile: string): RemoteRegistryClient {
  return new RemoteRegistryClient({
    baseUrl: url,
    profileKey: profile,
    fetchImpl: timeoutFetch
  });
}

function registryUrl(config: ApiConfig): string {
  return config.invokeProviders.registryUrl.trim().replace(/\/$/, "");
}

function registryProfile(config: ApiConfig): string {
  return config.invokeProviders.profile.trim();
}

function registryErrorMessage(error: unknown): string {
  if (error instanceof RegistryClientError) {
    return `${error.errorClass}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(350)
  });
}
