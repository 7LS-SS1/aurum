# AURUM Monitor Panel

## What is implemented

`/admin/monitor` and the admin sidebar alert badge are available to MANAGER/HEAD. Sources push metrics independently of the UI. The screen refreshes every 10 seconds while visible; the sidebar every 30 seconds. Missing/stale data is explicit. CPU, memory, filesystem capacity, receive/transmit rates and cumulative network counters are numeric measurements, never generated demo values.

Site cards use explicit Site IDs. A source may be the whole VPS, one container, a hosting account or a per-site exporter. Mapping several sites to one host **does not measure each site's individual CPU/RAM**. Dedicated per-site metrics require isolated containers/cgroups or a provider exporter. The bundled collector supports Linux hosts and cgroup-v2 containers; container disk is deliberately unknown because overlay filesystem free space is not a site's storage usage. No WordPress plugin update is required.

Defaults: CPU 85%, RAM 90%, disk 90%, bandwidth 80% for 3 consecutive samples. Recovery needs 2 samples below threshold minus 5 percentage points. Bandwidth uses max(RX,TX) against configured per-direction capacity, not the sum of full-duplex traffic. Without capacity it displays Mbps but does not invent utilization. The panel reports the latest recovery per metric. Active alert hysteresis persists beyond the graph window. Offline alerts are calculated when the dashboard is read; this is in-app alerting, not an external notification service.

Redis stores a maximum of 120 samples and 4 alert states per configured source, expiring 7 days after its last sample. This is a bounded live monitor, not billing or long-term incident history. Traffic counters reset at OS/interface restart and exclude Bunny/CDN traffic served elsewhere. Data ages out to unconnected, not healthy.

## AURUM server configuration

Set `MONITOR_REDIS_URL` (dedicated Redis preferred); otherwise `REDIS_URL` is used. Existing queues and cache are untouched. Production needs persistent Redis and capacity monitoring; Redis eviction or deletion loses monitoring history, never business records. No in-memory fallback masks storage outages. Upstash REST-only credentials are not supported by this collector store; a Redis protocol URL is required.

Set `MONITOR_SOURCES_JSON` as a JSON array. Example (replace hash, IDs and real capacity):

```json
[{"id":"aurum-vps","label":"AURUM VPS 187.77.152.240","scope":"host","siteIds":[],"tokenHash":"REPLACE_WITH_SHA256_HEX_OF_32_OR_MORE_CHARACTER_RANDOM_TOKEN","intervalSeconds":15,"capacityMbps":1000,"thresholds":{"cpu":85,"memory":90,"disk":90,"bandwidth":80}}]
```

Generate a distinct random token for each source and store only its SHA-256 hash in the AURUM config. Keep the raw token in the collector's environment file, never in browser JS or Git. Generate locally with Python `secrets.token_urlsafe(48)` and hash using `hashlib.sha256(token.encode()).hexdigest()`. Do not paste secrets into chat. Only add `capacityMbps` if the actual link capacity is known. Site IDs are shown in the per-site view before mapping. Rotate a token by changing its hash and collector environment.

An external per-site/provider exporter can POST the same schema below. Null means unavailable; percentages must never be inferred from response time. Scope is controlled by AURUM config, not the submitted body.

## Install on a VPS (after confirming SSH host identity)

1. Copy `collector.py` to `/opt/aurum-monitor/collector.py` and the service unit to `/etc/systemd/system/aurum-monitor.service`. Confirm Python 3 is installed.
2. Run `ip -brief link` to choose the actual public interface. Edit the unit's `--interfaces eth0`; do not include bridges/veth and their physical interface together. Choose the filesystem via `--disk-path` if needed. Additional mounts need separate source collectors.
3. Create `/etc/aurum-monitor.env` with mode 600 and root ownership:

```ini
AURUM_MONITOR_ENDPOINT=https://aurum123.com/api/monitor/ingest
AURUM_MONITOR_SOURCE=aurum-vps
AURUM_MONITOR_TOKEN=YOUR_RANDOM_SOURCE_TOKEN
```

4. Validate read-only collection: `python3 /opt/aurum-monitor/collector.py --scope host --interfaces YOUR_INTERFACE --once`. This prints numeric metrics without sending a request.
5. Enable using `systemctl daemon-reload` and `systemctl enable --now aurum-monitor`. Inspect `journalctl -u aurum-monitor --since '5 minutes ago'` without exposing environment secrets.
6. Verify 3 fresh samples in the dashboard, compare CPU/RAM/disk to VPS tooling and confirm RX/TX scope. Only then map sites. For a dedicated site container run with `--scope container` inside that container's own CPU/memory cgroup and network namespace. Do not point a host collector at a site's name to imply isolated metrics.

Collector needs outbound HTTPS only, no inbound metrics port, Docker socket, database credentials or root process. The systemd unit uses DynamicUser, read-only protection and CPU/memory caps. HTTP redirects are refused to protect the bearer token. Collection sends no URLs, logs, request bodies, filenames or visitor IPs.

Shared hosting needs a provider-supported exporter; Hostinger Web/Cloud resource statistics are account-level and may update only every 10–15 minutes. Set source scope and interval to the actual provider behavior; never present those samples as 15-second per-site usage.

## Ingest contract

`POST /api/monitor/ingest`, `Authorization: Bearer <source token>`, `X-Monitor-Source: <configured id>`. Body maximum 4096 bytes:

```json
{"timestamp":"2026-11-06T00:00:00Z","cpuPercent":25,"memoryUsed":1000000,"memoryTotal":4000000,"diskUsed":2000000,"diskTotal":8000000,"rxBytesPerSecond":1200,"txBytesPerSecond":2500,"rxBytes":120000,"txBytes":250000}
```

All measurement fields can be null. Timestamp must be within the freshness window. Duplicate/out-of-order/too-frequent samples return `accepted:false`; a sample is accepted no faster than 80% of the configured interval. Atomic Redis compare-and-set protects concurrent writes. Unknown source or bad token returns 401. The exact ingest route bypasses session middleware but validates the scoped token in its handler; all monitor reads still require the admin role.

## Deployment and rollback

No Prisma schema/migration, application record, file/R2 change or payment release. DB migration and restore gates are N/A for this read-only monitoring feature. Record current app commit/config before deployment. Drain active distribution jobs before replacing their application/worker container. Canary one source and one mapped site before enabling other sources. Test high values/recovery with an isolated test source, never falsify production metrics. Check Redis connectivity/retention, role rejection, no-secret response, missing-source and stale-source behavior.

Rollback: stop only `aurum-monitor.service`, deploy previous app commit `7540538100964aada14d165d162d7be9f1ec37f4`, and remove only the new monitor config if desired. Do not flush Redis or delete business data. Monitor keys expire automatically.

## Validation

Unit tests cover threshold duration, hysteresis, null metrics, stale/gapped samples, full-duplex utilization and token validation. Integration tests use an isolated local Redis and real route handlers for unauthorized ingestion, body/clock validation, duplicate handling, authorized reads, redaction, bounded history and persistent alerts. Run with `MONITOR_INTEGRATION_REDIS=redis://127.0.0.1:<isolated-port>` and `npx vitest run src/lib/monitor`. Without that variable the integration test is skipped.

Production source installation and real per-site attribution must be verified separately. A passing local test or deployed UI alone does not establish live VPS monitoring.

Reference: [Hostinger resource usage documentation](https://www.hostinger.com/support/2436138-how-to-check-resource-usage-in-hostinger/) explains account-level versus per-site availability and update intervals.

Verified locally on 2026-11-06: 8 monitor tests passed (including actual isolated Redis), ESLint and Next.js production build passed. The production bundle HTTP smoke returned 401 for anonymous reads, 401 for invalid ingest token, and 200/accepted for a valid scoped token. Linux Docker collection with a 128 MiB cgroup reported the actual 128 MiB memory limit and numeric CPU/network values. Desktop/mobile fixture checks verified alerts, site attribution warnings, no horizontal overflow and recovery from network-read failure. UI fixture metrics were synthetic; no production repair/publication request was sent. Build used a dummy localhost database, so production database reads were not validated.

Live installation remains pending: SSH strict host verification rejected 187.77.152.240 because the recorded key differs. Verify its host fingerprint from the provider console before changing known_hosts or connecting. Do not disable host-key checking.
