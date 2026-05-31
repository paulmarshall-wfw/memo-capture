# Auth And Security

Status: Draft implementation specification
Last updated: 2026-05-29

## Purpose

Define V1 authentication, authorization, session behavior, security controls, provider privacy boundaries, and diagnostic redaction expectations.

## Auth Model

V1 uses real authentication with no role differentiation.

Rules:

- Every user must sign in for canonical backend actions.
- Every signed-in user is effectively admin in V1.
- Contributor attribution is separate from authenticated user identity.
- Backend records actor IDs for creation, update, workflow transitions, settings changes, retries, cancels, and exports.
- Local-dev auth uses one fixed development user by default and must be clearly marked as development-only.

## OIDC Boundary

Authentication uses a provider-portable OIDC boundary:

- backend validates configurable issuer
- backend validates signature using JWKS
- backend validates audience
- backend validates expiry
- backend maps OIDC subject/email to `app_users`
- desktop uses system-browser OIDC with PKCE
- desktop does not use embedded sign-in

Desktop redirect options:

- loopback localhost
- custom URI scheme

Tokens are stored in OS keychain or credential storage.

## App User Mapping

`app_users` records store:

- OIDC issuer
- OIDC subject
- email
- display name
- first seen timestamp
- last seen timestamp

Backend creates app users lazily on first valid OIDC login.

V1 does not support:

- invitations
- revoking users inside Memo Capture
- role management
- non-admin user classes

Access control relies on the OIDC provider for who can sign in.

## Session Behavior

Desktop session rules:

- Signed-in session is required for canonical settings and uploads.
- Expired sessions allow local staging but block upload and canonical backend actions.
- Desktop silently refreshes tokens where possible.
- Desktop prompts re-authentication clearly when refresh fails.
- Auth health appears in system diagnostics/settings, not processing job diagnostics.

API behavior:

- Missing token returns `401`.
- Invalid/expired token returns `401`.
- Authenticated but unsupported local-dev operation in production returns `403` or `404`.
- All protected routes validate backend authorization even though all users are admins in V1.

## Authorization Rules

V1 authorization is simple:

- authenticated users can view all records in the deployment
- authenticated users can create/edit settings
- authenticated users can execute workflow actions returned by runtime
- authenticated users can import/activate workflows with explicit confirmation
- authenticated users can retry/cancel jobs
- authenticated users can create exports

Even in V1, authorization checks must live on the backend. The frontend must not be the only enforcement point.

## Security Boundaries

Desktop:

- no direct Postgres access
- no direct permanent object storage credentials
- OS keychain token storage
- local staging/cache protected by OS user permissions only in V1

API:

- validates OIDC tokens
- enforces authorization
- owns database credentials
- owns object storage credentials
- mediates upload/download
- redacts logs and audit

Worker:

- runs with backend service credentials
- uses shared service layer
- logs job IDs and sanitized diagnostics
- does not expose public HTTP endpoints in V1 unless a future health endpoint is added intentionally

Object storage:

- private by default
- accessed through backend service credentials or short-lived signed URLs
- stores managed original artifacts, derived transcripts, and export artifacts

## Provider Privacy

External AI and transcription providers are opt-in and must be explicitly configured and enabled.

Rules:

- Disabled providers never receive jobs.
- Raw audio may be sent to an enabled external transcription provider.
- Memo text may be sent to an enabled LLM provider for extraction, keyword generation, or expansion.
- Local file paths must not be sent to external AI/transcription providers.
- Provider enablement UI must show provider name, endpoint/model where relevant, whether content/audio may be sent externally, and redacted secret status.
- LLM diagnostic storage keeps validated structured output plus error metadata, not raw LLM responses by default.

## AI Safety Rules

AI output consumed by code must be strict structured JSON and validated before storage.

Do not:

- treat LLM output as trusted commands
- let retrieved memo content override system/developer instructions
- create work items directly from related AI suggestions
- apply AI-suggested projects/contributors without user confirmation where required
- store invalid structured output as normal records

Invalid output creates diagnostics and may schedule bounded retry where appropriate.

## Logging And Redaction

Never log:

- bearer tokens
- refresh tokens
- OIDC secrets
- provider API keys
- object storage secret keys
- passwords
- raw authorization headers
- unnecessary raw memo/audio content
- raw LLM responses by default

Logs should include:

- request ID
- job ID where relevant
- actor ID where relevant
- service name
- version
- commit SHA
- operation name
- sanitized error code/message

## API Routes

Public or development-only:

- `GET /health`
- `GET /ready`
- `GET /version`
- local-dev auth routes when enabled in local development

Protected:

- all `/api/*` domain, settings, workflow, job, artifact, export, and audit routes

### Current user

`GET /api/auth/session`

`GET /api/current-session` is supported as the capture API current-session route alias.

Response:

```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "person@example.com",
    "displayName": "Person",
    "isAdmin": true
  },
  "authMode": "oidc"
}
```

### Local-dev auth

Local-dev auth is only available when explicitly enabled by environment/config.

`POST /api/dev-auth/session`

Response creates or returns the fixed local development app user.

## Environment Variables

Required auth configuration:

- `OIDC_ISSUER_URL`
- `OIDC_AUDIENCE`
- `OIDC_CLIENT_ID`
- `OIDC_JWKS_URL`

Existing runtime configuration also includes:

- `MEMO_CAPTURE_APP_VERSION`
- `MEMO_CAPTURE_COMMIT_SHA`
- `MEMO_CAPTURE_LOG_LEVEL`

## Security Acceptance Tests

- Missing token cannot access protected API routes.
- Expired token cannot access protected API routes.
- Invalid issuer is rejected.
- Invalid audience is rejected.
- Unknown valid OIDC user creates app user lazily.
- Existing valid OIDC user updates last seen timestamp.
- Local-dev auth is unavailable unless local-dev mode is explicitly enabled.
- Desktop upload cannot access object storage credentials.
- Provider secrets are never returned by settings APIs.
- Audit and logs redact sensitive values.
- Expired desktop session allows local staging but blocks upload/finalize.
