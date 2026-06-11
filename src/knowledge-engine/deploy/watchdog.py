#!/usr/bin/env python3
"""KB watchdog (read-only). Cron */5. Writes atomic status JSON for wp-kb health
and the hermes01 poller. Never restarts anything — docker restart policy owns recovery."""
import json, os, subprocess, time, urllib.request, urllib.error

STATE = "/opt/ragflow-deploy/health-status.json"
KEY_FILE = "/opt/ragflow-deploy/ragflow-api-key.txt"
ENV_FILE = "/opt/ragflow-deploy/watchdog.env"  # optional: HEALTHCHECKS_URL=...
CONTAINERS = ["docker-es01-1", "docker-mysql-1", "docker-minio-1", "docker-redis-1",
              "docker-ragflow-cpu-1", "docker-tei-cpu-1"]
STUCK_PARSE_SECS = 2 * 3600

def sh(args, timeout=30):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ""

def http_code(url, timeout=10):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0

def api(path, key):
    req = urllib.request.Request("http://127.0.0.1:9380" + path,
                                 headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

prev = {}
try:
    with open(STATE) as f: prev = json.load(f)
except Exception: pass

reasons, status = [], "ok"
def flag(level, msg):
    global status
    reasons.append(msg)
    order = {"ok": 0, "warn": 1, "critical": 2}
    if order[level] > order[status]: status = level

containers = {}
prev_c = prev.get("containers", {})
for name in CONTAINERS:
    out = sh(["docker", "inspect", "-f",
              "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.OOMKilled}}|{{.RestartCount}}", name])
    if not out:
        containers[name] = {"status": "absent"}; flag("critical", name + " absent"); continue
    st, health, oom, rc = out.split("|"); rc = int(rc)
    containers[name] = {"status": st, "health": health, "oom_killed": oom == "true", "restart_count": rc}
    if st != "running": flag("critical", name + " " + st)
    elif health == "unhealthy": flag("critical", name + " unhealthy")
    if oom == "true": flag("critical", name + " OOM-killed")
    prc = prev_c.get(name, {}).get("restart_count")
    if prc is not None:
        if rc > prc: flag("warn", name + " restarted since last check")
        elif rc < prc: flag("warn", "docker daemon restarted (restart counters reset)")

if http_code("http://127.0.0.1:9380/api/v1/system/ping") != 200: flag("critical", "ragflow api ping failed")
if http_code("http://127.0.0.1:6380/health") != 200: flag("critical", "tei health failed")
if http_code("http://127.0.0.1:9382/mcp") not in (200, 405, 406): flag("warn", "mcp endpoint unexpected")

oom_total = 0
for line in open("/proc/vmstat"):
    if line.startswith("oom_kill "): oom_total = int(line.split()[1])
prev_oom = prev.get("oom_kill_total")
if prev_oom is not None and oom_total > prev_oom:
    flag("critical", "kernel OOM kill(s) since last check: " + str(oom_total - prev_oom))

df = sh(["df", "--output=pcent,avail", "-BG", "/"]).splitlines()
disk_pct, disk_avail = 0, 0
if len(df) > 1:
    parts = df[1].split()
    disk_pct = int(parts[0].rstrip("%")); disk_avail = int(parts[1].rstrip("G"))
    if disk_pct >= 90: flag("critical", "disk " + str(disk_pct) + "% used")
    elif disk_pct >= 80: flag("warn", "disk " + str(disk_pct) + "% used")
mem_avail_kb = 0
for line in open("/proc/meminfo"):
    if line.startswith("MemAvailable"): mem_avail_kb = int(line.split()[1])
if mem_avail_kb < 1024 * 1024: flag("warn", "low RAM: " + str(mem_avail_kb // 1024) + " MiB available")

# digestion probe: docs stuck parsing or failed — the silent killer
datasets, stuck, failed = [], 0, 0
try:
    key = open(KEY_FILE).read().strip()
    now_ms = time.time() * 1000
    for ds in (api("/api/v1/datasets?page_size=100", key).get("data") or []):
        datasets.append({"name": ds["name"], "docs": ds.get("document_count", 0),
                         "chunks": ds.get("chunk_count", 0)})
        body = api("/api/v1/datasets/" + ds["id"] + "/documents?page_size=100", key)
        for doc in (body.get("data") or {}).get("docs", []):
            run = str(doc.get("run", ""))
            upd = doc.get("update_time") or doc.get("create_time") or now_ms
            if run in ("FAIL", "4"): failed += 1
            elif run in ("RUNNING", "1") and (now_ms - upd) > STUCK_PARSE_SECS * 1000: stuck += 1
    if failed: flag("warn", str(failed) + " document(s) in FAIL parse state")
    if stuck: flag("critical", str(stuck) + " document(s) stuck parsing >2h")
except Exception as e:
    flag("warn", "digestion probe failed: " + str(e))

out = {
    "generated_at": int(time.time()), "interval_s": 600, "seq": prev.get("seq", 0) + 1,
    "status": status, "reasons": reasons, "containers": containers,
    "oom_kill_total": oom_total, "disk_pct": disk_pct, "disk_avail_gb": disk_avail,
    "mem_available_mb": mem_avail_kb // 1024, "datasets": datasets,
}
tmp = STATE + ".tmp"
with open(tmp, "w") as f: json.dump(out, f, indent=1)
os.replace(tmp, STATE)
print(time.strftime("%F %T"), "seq=" + str(out["seq"]), "status=" + status, "; ".join(reasons) or "all clear")

hc = ""
if os.path.exists(ENV_FILE):
    for line in open(ENV_FILE):
        if line.startswith("HEALTHCHECKS_URL="): hc = line.split("=", 1)[1].strip()
if hc:
    try: urllib.request.urlopen(hc if status == "ok" else hc + "/fail", timeout=10)
    except Exception: pass
