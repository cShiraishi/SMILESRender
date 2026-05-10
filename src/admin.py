"""
Admin panel — traffic monitoring, model status, server resources.

Access: /<ADMIN_PREFIX>  (default: /sradmin)
Auth:   HTTP Basic — user "admin" + ADMIN_PASS env var
        If ADMIN_PASS is not set, admin panel is disabled.
"""
import os, time, functools, collections, threading
from datetime import datetime, timezone
from flask import Blueprint, request, Response, jsonify

# ── Config ────────────────────────────────────────────────────────────────
ADMIN_PREFIX  = os.getenv("ADMIN_PREFIX",  "sradmin")   # URL prefix (no leading slash)
ADMIN_USER    = os.getenv("ADMIN_USER",    "admin")
ADMIN_PASS    = os.getenv("ADMIN_PASS",    "")          # empty = panel disabled

# ── In-memory telemetry ───────────────────────────────────────────────────
_lock       = threading.Lock()
_start_time = time.time()

# Per-route stats: route -> {calls, total_ms, errors, [last 20 durations]}
_route_stats: dict[str, dict] = collections.defaultdict(lambda: {
    "calls": 0, "total_ms": 0.0, "errors": 0, "durations": collections.deque(maxlen=100)
})

# Recent errors: circular buffer (last 200)
_recent_errors: collections.deque = collections.deque(maxlen=200)

# Model call counters (populated by inject_admin below)
_model_calls: dict[str, int] = {"bbb": 0, "tox21": 0, "deep_admet": 0}

# ── Public helpers (called from routes.py to count model usage) ───────────
def inc_model(name: str):
    with _lock:
        _model_calls[name] = _model_calls.get(name, 0) + 1

# ── Request hooks ─────────────────────────────────────────────────────────
def record_request(app):
    """Register before/after_request hooks on the Flask app."""

    @app.before_request
    def _before():
        request._t0 = time.monotonic()

    @app.after_request
    def _after(response):
        t0 = getattr(request, "_t0", None)
        if t0 is None:
            return response
        ms = (time.monotonic() - t0) * 1000
        route = request.endpoint or request.path
        # Ignore static files
        if route in ("static", None) or request.path.startswith("/static"):
            return response
        with _lock:
            s = _route_stats[route]
            s["calls"] += 1
            s["total_ms"] += ms
            s["durations"].append(ms)
            if response.status_code >= 400:
                s["errors"] += 1
                _recent_errors.append({
                    "ts":     datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "route":  request.path,
                    "method": request.method,
                    "status": response.status_code,
                    "ms":     round(ms, 1),
                })
        return response

# ── Auth ──────────────────────────────────────────────────────────────────
def _require_auth(f):
    @functools.wraps(f)
    def wrapper(*a, **kw):
        if not ADMIN_PASS:
            return Response("Admin panel disabled — set ADMIN_PASS env var.", 503)
        auth = request.authorization
        if not auth or auth.username != ADMIN_USER or auth.password != ADMIN_PASS:
            return Response(
                "Admin area — authentication required.",
                401,
                {"WWW-Authenticate": 'Basic realm="SMILESRender Admin"'},
            )
        return f(*a, **kw)
    return wrapper

# ── Blueprint ─────────────────────────────────────────────────────────────
bp = Blueprint("admin", __name__, url_prefix=f"/{ADMIN_PREFIX}")

@bp.route("/")
@_require_auth
def dashboard():
    return Response(_render_html(), mimetype="text/html")

@bp.route("/api")
@_require_auth
def api_stats():
    return jsonify(_collect_stats())

# ── Stats collector ───────────────────────────────────────────────────────
def _collect_stats():
    import psutil

    uptime_s = int(time.time() - _start_time)
    h, rem   = divmod(uptime_s, 3600)
    m, s     = divmod(rem, 60)

    with _lock:
        routes = []
        for route, st in sorted(_route_stats.items(), key=lambda x: -x[1]["calls"]):
            durs = list(st["durations"])
            avg  = st["total_ms"] / st["calls"] if st["calls"] else 0
            p95  = sorted(durs)[int(len(durs) * 0.95)] if durs else 0
            routes.append({
                "route":    route,
                "calls":    st["calls"],
                "errors":   st["errors"],
                "avg_ms":   round(avg, 1),
                "p95_ms":   round(p95, 1),
                "err_rate": round(st["errors"] / st["calls"] * 100, 1) if st["calls"] else 0,
            })
        errors  = list(reversed(_recent_errors))[:50]
        mcalls  = dict(_model_calls)

    cpu   = psutil.cpu_percent(interval=0.2)
    ram   = psutil.virtual_memory()
    disk  = psutil.disk_usage("/")

    return {
        "uptime":       f"{h:02d}:{m:02d}:{s:02d}",
        "uptime_s":     uptime_s,
        "total_req":    sum(r["calls"] for r in routes),
        "total_errors": sum(r["errors"] for r in routes),
        "routes":       routes,
        "recent_errors": errors,
        "model_calls":  mcalls,
        "system": {
            "cpu_pct":   cpu,
            "ram_pct":   ram.percent,
            "ram_used_mb": round(ram.used / 1e6),
            "ram_total_mb": round(ram.total / 1e6),
            "disk_pct":  disk.percent,
            "disk_used_gb": round(disk.used / 1e9, 1),
            "disk_total_gb": round(disk.total / 1e9, 1),
        },
    }

# ── HTML dashboard ────────────────────────────────────────────────────────
def _render_html():
    prefix = ADMIN_PREFIX
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SMILESRender — Admin</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;font-size:14px}}
  header{{background:#1e293b;padding:16px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #334155}}
  header h1{{font-size:17px;font-weight:700;color:#f8fafc}}
  header .badge{{font-size:10px;background:#0ea5e9;color:#fff;padding:2px 8px;border-radius:20px;font-weight:700}}
  .uptime{{margin-left:auto;font-size:12px;color:#94a3b8}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;padding:20px 24px 0}}
  .card{{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px}}
  .card h3{{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}}
  .card .val{{font-size:28px;font-weight:800;color:#f1f5f9}}
  .card .sub{{font-size:11px;color:#64748b;margin-top:2px}}
  .bar-wrap{{background:#0f172a;border-radius:4px;height:8px;overflow:hidden;margin-top:8px}}
  .bar{{height:100%;border-radius:4px;transition:width .4s}}
  section{{padding:20px 24px}}
  section h2{{font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;border-bottom:1px solid #334155;padding-bottom:8px}}
  table{{width:100%;border-collapse:collapse;font-size:12px}}
  th{{text-align:left;padding:6px 10px;color:#64748b;font-weight:700;border-bottom:1px solid #334155;font-size:11px}}
  td{{padding:6px 10px;border-bottom:1px solid #1e293b}}
  tr:hover td{{background:#1e293b}}
  .tag{{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10px;font-weight:700}}
  .ok{{background:#064e3b;color:#34d399}}
  .warn{{background:#78350f;color:#fbbf24}}
  .err{{background:#7f1d1d;color:#f87171}}
  .models{{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}}
  .model-card{{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 14px;min-width:140px}}
  .model-card .name{{font-size:11px;font-weight:700;color:#94a3b8}}
  .model-card .calls{{font-size:20px;font-weight:800;color:#f1f5f9}}
  .model-card .status{{font-size:10px;margin-top:2px}}
  #refresh-btn{{float:right;background:#0ea5e9;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}}
  #refresh-btn:hover{{background:#0284c7}}
  .ts{{color:#475569;font-size:11px}}
  .method{{color:#7dd3fc;font-weight:700}}
</style>
</head>
<body>
<header>
  <h1>SMILESRender</h1>
  <span class="badge">ADMIN</span>
  <span class="uptime" id="uptime">—</span>
</header>

<div class="grid" id="kpi-grid">
  <div class="card"><h3>Total de Requests</h3><div class="val" id="total-req">—</div></div>
  <div class="card"><h3>Erros (4xx/5xx)</h3><div class="val" id="total-err">—</div></div>
  <div class="card">
    <h3>CPU</h3><div class="val" id="cpu">—</div>
    <div class="bar-wrap"><div class="bar" id="cpu-bar" style="background:#0ea5e9"></div></div>
  </div>
  <div class="card">
    <h3>RAM</h3><div class="val" id="ram">—</div><div class="sub" id="ram-sub">—</div>
    <div class="bar-wrap"><div class="bar" id="ram-bar" style="background:#8b5cf6"></div></div>
  </div>
  <div class="card">
    <h3>Disco</h3><div class="val" id="disk">—</div><div class="sub" id="disk-sub">—</div>
    <div class="bar-wrap"><div class="bar" id="disk-bar" style="background:#10b981"></div></div>
  </div>
</div>

<section>
  <h2>Modelos ML <button id="refresh-btn" onclick="load()">↻ Atualizar</button></h2>
  <div class="models" id="models">—</div>
</section>

<section>
  <h2>Tráfego por Rota</h2>
  <table>
    <thead><tr><th>Rota</th><th>Calls</th><th>Erros</th><th>Avg (ms)</th><th>P95 (ms)</th><th>Err%</th></tr></thead>
    <tbody id="routes-body"></tbody>
  </table>
</section>

<section>
  <h2>Últimos Erros</h2>
  <table>
    <thead><tr><th>Hora</th><th>Método</th><th>Rota</th><th>Status</th><th>Tempo</th></tr></thead>
    <tbody id="errors-body"></tbody>
  </table>
</section>

<script>
const PREFIX = "{prefix}";
function tag(cls, txt){{ return `<span class="tag ${{cls}}">${{txt}}</span>`; }}

async function load() {{
  const r = await fetch(`/${{PREFIX}}/api`);
  const d = await r.json();

  document.getElementById("uptime").textContent = "Uptime " + d.uptime;
  document.getElementById("total-req").textContent = d.total_req.toLocaleString();
  document.getElementById("total-err").textContent = d.total_errors.toLocaleString();

  const sys = d.system;
  document.getElementById("cpu").textContent = sys.cpu_pct.toFixed(1) + "%";
  document.getElementById("cpu-bar").style.width = sys.cpu_pct + "%";
  document.getElementById("ram").textContent = sys.ram_pct.toFixed(1) + "%";
  document.getElementById("ram-sub").textContent = sys.ram_used_mb + " / " + sys.ram_total_mb + " MB";
  document.getElementById("ram-bar").style.width = sys.ram_pct + "%";
  document.getElementById("disk").textContent = sys.disk_pct.toFixed(1) + "%";
  document.getElementById("disk-sub").textContent = sys.disk_used_gb + " / " + sys.disk_total_gb + " GB";
  document.getElementById("disk-bar").style.width = sys.disk_pct + "%";

  // Models
  const modelNames = {{"bbb":"GraphB3 BBB","tox21":"Tox21","deep_admet":"DeepADMET"}};
  document.getElementById("models").innerHTML = Object.entries(d.model_calls).map(([k,v]) =>
    `<div class="model-card">
       <div class="name">${{modelNames[k]||k}}</div>
       <div class="calls">${{v}}</div>
       <div class="status ${{v>0?'ok':'ts'}}">predições</div>
     </div>`
  ).join("");

  // Routes table
  document.getElementById("routes-body").innerHTML = d.routes.map(r => {{
    const errCls = r.err_rate > 20 ? "err" : r.err_rate > 5 ? "warn" : "ok";
    return `<tr>
      <td><code style="color:#7dd3fc">${{r.route}}</code></td>
      <td>${{r.calls.toLocaleString()}}</td>
      <td>${{r.errors}}</td>
      <td>${{r.avg_ms}}</td>
      <td>${{r.p95_ms}}</td>
      <td>${{tag(errCls, r.err_rate + "%")}}</td>
    </tr>`;
  }}).join("");

  // Errors table
  document.getElementById("errors-body").innerHTML = d.recent_errors.map(e => {{
    const sc = e.status;
    const cls = sc >= 500 ? "err" : sc >= 400 ? "warn" : "ok";
    return `<tr>
      <td class="ts">${{e.ts.replace("T"," ")}}</td>
      <td class="method">${{e.method}}</td>
      <td><code style="color:#f1f5f9">${{e.route}}</code></td>
      <td>${{tag(cls, sc)}}</td>
      <td class="ts">${{e.ms}} ms</td>
    </tr>`;
  }}).join("") || `<tr><td colspan="5" style="color:#475569;text-align:center;padding:20px">Nenhum erro registrado.</td></tr>`;
}}

load();
setInterval(load, 15000);  // auto-refresh every 15s
</script>
</body>
</html>"""
