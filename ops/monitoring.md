# Monitoring and alert policy

Step 35 provides a small, deterministic alert evaluator while production
deployment and production credentials are still absent. A production operator
must connect the Supabase log export/monitoring sink to the normalized snapshot
shape below and run `npm run monitor:check` at least once per minute.

## Signals

- Health: `GET /functions/v1/save-sync/v1/health`; alert on a non-200 response,
  a body whose status is not `ok`, or a timeout. Treat two consecutive failed
  checks as an incident.
- Error rate: server errors divided by all observed server requests in the
  window. Include Edge Function 5xx responses and database/connection errors.
- Save-rejection rate: rejected authenticated save attempts divided by all save
  attempts. `save_audit` is the authoritative application record for requests
  that reach the authenticated upload path; rate-limited requests are also
  counted from the Edge Function log because Step 25 refuses them before the
  audit write.
- Auth-failure rate: invalid/expired bearer responses and GoTrue sign-in
  failures divided by auth attempts. Do not record access tokens or request
  bodies in the monitoring payload.

The evaluator requires a 20-event minimum before applying a percentage alert:

| Signal | Alert when above |
| --- | ---: |
| Server errors | 5% |
| Save rejections | 10% |
| Auth failures | 25% |

The thresholds are operational starting points, not gameplay rules. A sustained
save-rejection alert can indicate an attack or a too-tight Step 23 bound. An
auth-failure alert can indicate credential abuse or a broken deployment.

## Snapshot contract and command

The log/SQL adapter writes a JSON snapshot like this into an ephemeral file or
`MONITORING_SNAPSHOT`:

```json
{
  "health": { "status": "ok" },
  "requests": { "total": 100, "serverErrors": 1 },
  "saves": { "attempts": 40, "rejections": 2 },
  "auth": { "attempts": 30, "failures": 1 }
}
```

Run the check with `npm run monitor:check -- --input path/to/snapshot.json`.
Exit code `0` means no alert, `2` means an alert was raised, and `1` means
the monitor itself could not read its input or health endpoint. The JSON output
is suitable for a cron job, uptime service, or a single operator's webhook.

`npm test` includes a deliberately induced snapshot with a failed health check
and all three rates over threshold; it must exit with the alert code. This is
the Step 35 failure test and prevents the monitor from becoming documentation
that is never exercised.

## Production hand-off

When the hosted project exists, configure the sole operator's alert channel
(email or an approved webhook), the Supabase log export, the one-minute health
probe, and a secret-free log transformation that produces the snapshot above.
Keep the application service-role key only in the server-side adapter. The
repository currently contains no production URL, credential, or alert
destination to configure, by design.
