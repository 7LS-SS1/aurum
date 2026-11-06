#!/usr/bin/env python3
"""Read-only Linux collector. Sends only numeric metrics; never reads application data."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import time
import urllib.request
import urllib.error


def read_cpu():
    numbers = [int(x) for x in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    return sum(numbers), numbers[3] + numbers[4]


def network(interfaces):
    counters = {}
    for line in Path('/proc/net/dev').read_text().splitlines()[2:]:
        name, text = line.split(':', 1)
        name = name.strip()
        if name in interfaces:
            fields = text.split()
            counters[name] = (int(fields[0]), int(fields[8]))
    if set(counters) != set(interfaces):
        raise ValueError('Configured network interface missing')
    return tuple(sum(value[i] for value in counters.values()) for i in (0, 1))


def container_cpu():
    fields = dict(line.split() for line in Path('/sys/fs/cgroup/cpu.stat').read_text().splitlines())
    quota, period = Path('/sys/fs/cgroup/cpu.max').read_text().split()
    cores = len(os.sched_getaffinity(0)) if quota == 'max' else int(quota) / int(period)
    return int(fields['usage_usec']), cores


def memory(scope):
    if scope == 'container':
        maximum = Path('/sys/fs/cgroup/memory.max').read_text().strip()
        used = int(Path('/sys/fs/cgroup/memory.current').read_text())
        return (used, int(maximum)) if maximum != 'max' else (None, None)
    fields = {line.split(':')[0]: int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if len(line.split()) >= 2}
    total = fields['MemTotal']
    return total-fields['MemAvailable'], total


def collect(args, previous):
    now = time.monotonic()
    cpu = read_cpu() if args.scope == 'host' else container_cpu()
    net = network(args.interfaces.split(','))
    state = (now, cpu, net)
    percentage = rx_rate = tx_rate = None
    if previous:
        old_time, old_cpu, old_net = previous
        elapsed = now-old_time
        if args.scope == 'host':
            total = cpu[0]-old_cpu[0]
            percentage = 100*(1-(cpu[1]-old_cpu[1])/total) if total > 0 else None
        else:
            percentage = (cpu[0]-old_cpu[0]) / 1e6 / elapsed / cpu[1] * 100
        rx_rate = (net[0]-old_net[0])/elapsed if net[0] >= old_net[0] else None
        tx_rate = (net[1]-old_net[1])/elapsed if net[1] >= old_net[1] else None
    used, total = memory(args.scope)
    # Container overlay storage is shared with the host: do not call it per-site storage.
    disk = shutil.disk_usage(args.disk_path) if args.scope == 'host' else None
    sample = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
                  cpuPercent=max(0, min(100, percentage)) if percentage is not None else None,
                  memoryUsed=used, memoryTotal=total, diskUsed=disk.used if disk else None,
                  diskTotal=disk.total if disk else None, rxBytes=net[0], txBytes=net[1],
                  rxBytesPerSecond=rx_rate, txBytesPerSecond=tx_rate)
    return sample, state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', choices=['host', 'container'], required=True)
    parser.add_argument('--interfaces', required=True, help='Exact comma-separated interfaces; avoid bridges/veth duplication')
    parser.add_argument('--disk-path', default='/')
    parser.add_argument('--interval', type=int, default=15)
    parser.add_argument('--once', action='store_true', help='Print one sample after a 1-second measurement; no network write')
    args = parser.parse_args()
    if args.interval < 10:
        parser.error('interval must be >= 10 seconds')
    endpoint = os.environ.get('AURUM_MONITOR_ENDPOINT', '')
    token = os.environ.get('AURUM_MONITOR_TOKEN', '')
    source = os.environ.get('AURUM_MONITOR_SOURCE', '')
    if not args.once and (not endpoint.startswith('https://') or len(token) < 32 or not source):
        parser.error('Set HTTPS AURUM_MONITOR_ENDPOINT, AURUM_MONITOR_SOURCE and AURUM_MONITOR_TOKEN')
    _, previous = collect(args, None)
    time.sleep(1 if args.once else args.interval)
    while True:
        start = time.monotonic()
        try:
            sample, previous = collect(args, previous)
            if args.once:
                print(json.dumps(sample))
                return
            request = urllib.request.Request(endpoint, data=json.dumps(sample).encode(),
                headers={'Content-Type': 'application/json', 'Authorization': 'Bearer '+token, 'X-Monitor-Source': source}, method='POST')
            # Refuse redirects so credentials cannot be forwarded to another endpoint.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *unused):
                    return None
            with urllib.request.build_opener(NoRedirect).open(request, timeout=8) as response:
                response.read(4096)
        except Exception as error:
            # Never print URLs, tokens or response bodies.
            print('Monitor collection/delivery failed: '+type(error).__name__, flush=True)
            if args.once:
                raise SystemExit(1)
        time.sleep(max(1, args.interval-(time.monotonic()-start)))

if __name__ == '__main__':
    main()
