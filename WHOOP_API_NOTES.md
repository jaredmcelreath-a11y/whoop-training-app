# WHOOP API notes (from developer.whoop.com, checked 2026-10-20)

## Access
- Sign in at https://developer-dashboard.whoop.com with your WHOOP account, create a team, then create an app.
- An app gets a Client ID and Client Secret. Keep the secret server-side only.
- You can create up to 5 apps.
- New apps start on the **Sandbox** tier: up to 10 members, no approval needed. That's enough for personal use.

## OAuth 2.0 (authorization code flow)
- Auth URL: `https://api.prod.whoop.com/oauth/oauth2/auth`
- Token URL: `https://api.prod.whoop.com/oauth/oauth2/token` (also used for refresh)
- `state` must be 8 characters.
- Redirect URI must be registered in the dashboard. `https://...` and custom schemes like `whoop://...` both work.
- Access tokens last about 1 hour (`expires_in: 3600`). An expired token returns 401.
- **You must request the `offline` scope to get a refresh token.**
- Each refresh rotates **both** tokens, so store the new refresh token. If two refreshes run at once, one fails. Serialize refreshes per user.
- Send `Authorization: Bearer <token>`.
- To revoke when a user disconnects: `DELETE /developer/v2/user/access`

## Scopes
`offline`, `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement`

## Endpoints (base `https://api.prod.whoop.com/developer/v2`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/user/profile/basic` | read:profile | user_id, email, name |
| GET | `/user/measurement/body` | read:body_measurement | height, weight, max_heart_rate |
| GET | `/cycle`, `/cycle/{id}` | read:cycles | day strain, kJ, avg/max HR |
| GET | `/cycle/{id}/sleep` | read:sleep | |
| GET | `/cycle/{id}/recovery` | read:recovery | |
| GET | `/recovery` | read:recovery | recovery_score, resting_heart_rate, hrv_rmssd_milli, spo2, skin temp |
| GET | `/activity/sleep`, `/activity/sleep/{uuid}` | read:sleep | stages, performance %, sleep_needed, respiratory rate |
| GET | `/activity/workout`, `/activity/workout/{uuid}` | read:workout | sport_name, strain, avg/max HR, kJ, distance_meter, altitude, zone_durations (zones 0–5, in ms) |

- Collection endpoints take `start`, `end` (ISO 8601), `limit` (max 25), and `nextToken` for pagination.
- v1 integer IDs map to v2 IDs through `GET /developer/v1/activity-mapping/{v1Id}`.

## Rate limits
- 100 requests per minute and 10,000 per day, per client. Exceeding either returns 429.
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- To ask for more, go to the dashboard, click Open Request, and choose "Rate limit increase".

## Webhooks (use v2; v1 is removed)
- Set the Webhook URL at the bottom of the app page in the dashboard, with Model Version set to v2. The endpoint must be HTTPS and accept POST.
- Events: `workout.updated|deleted`, `sleep.updated|deleted`, `recovery.updated|deleted`. Creates arrive as `.updated`.
- **There are no webhooks for cycles (day strain) or body measurements.** Poll for those.
- Payload: `{ user_id, id (UUID; for recovery it's the sleep UUID), type, trace_id }`. It's a notification only, so fetch the data from the API.
- Signature: `base64(HMAC_SHA256(client_secret, X-WHOOP-Signature-Timestamp + rawBody))` must equal `X-WHOOP-Signature`.
- Failed deliveries are retried 5 times over about 1 hour. A delivery fails on any non-2xx or a timeout, so return 2xx fast and queue the work.
- Deduplicate on `trace_id`. Deliveries can be missed, so also run a periodic reconciliation pull.
