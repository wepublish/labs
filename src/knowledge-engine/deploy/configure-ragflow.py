#!/usr/bin/env python3
"""configure-ragflow.py — runs ON onyx01 after provision-onyx01.sh.

Headless RAGFlow setup, reproducing the auth flow validated in the bake-off
(see BAKEOFF_RESULTS.md). RAGFlow here is RETRIEVAL-ONLY — no chat LLM is set
(generation is OpenRouter inside Hermes), so callers must not pass keyword:true
to /retrieval.

Steps:
  1. Encrypt the admin password with RAGFlow's OWN crypt() inside the container
     (RSA-PKCS1v15(base64(pw)) — version-proof, no RSA reimplementation here).
  2. Register the admin user (idempotent) and log in to get a session token.
  3. Mint a /system/tokens API key — this is the Bearer key Hermes uses for
     /api/v1/retrieval and the dataset API.
  4. Create the three datasets (public / internal / newsroom:pilot) with bge-m3.
  5. Write the API key to the state dir and print it.

Stdlib only (urllib) — no pip installs on the box.

NOTE: steps 2-4 are reconstructed from the bake-off; verify on the first real run
against the resized box and adjust endpoint shapes if a RAGFlow upgrade moved them.
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error

STATE_DIR = "/opt/ragflow-deploy"
DATASETS = ["public", "internal", "newsroom:pilot"]
# v0.25.6: local embeddings = TEI sidecar via the "Builtin" factory; the model
# name must equal TEI_MODEL in docker/.env (provision sets BAAI/bge-m3).
EMBEDDING = "BAAI/bge-m3@Builtin"


def log(msg):  print(f"\033[1;36m[configure]\033[0m {msg}")
def warn(msg): print(f"\033[1;33m[configure][warn]\033[0m {msg}")
def die(msg):  print(f"\033[1;31m[configure][FATAL]\033[0m {msg}", file=sys.stderr); sys.exit(1)


def http(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


def find_container():
    """v0.25.6 compose has no container_name (service is ragflow-cpu/-gpu, so the
    container is e.g. docker-ragflow-cpu-1); older tags used ragflow-server."""
    out = subprocess.run(["docker", "ps", "--format", "{{.Names}}"],
                         capture_output=True, text=True)
    names = out.stdout.split()
    for cand in ("ragflow-server", "ragflow-cpu", "ragflow-gpu"):
        for n in names:
            if cand in n:
                return n
    die(f"no running RAGFlow server container found among: {names}")


def encrypt_password(container, plaintext):
    """Use RAGFlow's bundled crypt() inside the container — keeps us version-proof."""
    out = subprocess.run(
        ["docker", "exec", container, "python3", "-c",
         f"from api.utils.crypt import crypt; print(crypt({plaintext!r}))"],
        capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip():
        die(f"could not encrypt password via container crypt(): {out.stderr.strip()}")
    return out.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:9380")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True, help="admin password (alnum; avoid shell metachars)")
    ap.add_argument("--nickname", default="wepublish-admin")
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    container = find_container()
    log(f"RAGFlow server container: {container}")
    enc = encrypt_password(container, args.password)

    # ---- register (idempotent) — v0.25.6: POST /api/v1/users ----
    st, _, body = http("POST", f"{base}/api/v1/users",
                       {"email": args.email, "nickname": args.nickname, "password": enc})
    code = body.get("code")
    if code == 0:
        log("admin user registered")
    elif "regist" in json.dumps(body).lower() or code in (103, 100):
        log("admin user already exists — continuing to login")
    else:
        warn(f"register returned {st} {body} — attempting login anyway")

    # ---- login — v0.25.6: POST /api/v1/auth/login, token in Authorization header ----
    st, hdrs, body = http("POST", f"{base}/api/v1/auth/login",
                          {"email": args.email, "password": enc})
    if body.get("code") != 0:
        die(f"login failed: {st} {body}")
    hdrs_ci = {k.lower(): v for k, v in hdrs.items()}
    token = hdrs_ci.get("authorization") or (body.get("data") or {}).get("access_token")
    if not token:
        die(f"login ok but no token in header/body: headers={hdrs} body={body}")
    log("logged in")
    auth = {"Authorization": token}

    # ---- mint API key for /retrieval + dataset API — v0.25.6: POST /api/v1/system/tokens ----
    st, _, body = http("POST", f"{base}/api/v1/system/tokens", {}, auth)
    api_key = (body.get("data") or {}).get("token") if body.get("code") == 0 else None
    if not api_key:
        die(f"could not mint API key: {st} {body}")
    log("minted /system/tokens API key")

    # ---- create datasets (session auth; endpoints are @login_required) ----
    for name in DATASETS:
        st, _, body = http("POST", f"{base}/api/v1/datasets",
                           {"name": name, "embedding_model": EMBEDDING, "chunk_method": "naive"},
                           auth)
        if body.get("code") == 0:
            log(f"dataset created: {name}")
        elif "exist" in json.dumps(body).lower():
            log(f"dataset exists: {name}")
        else:
            warn(f"dataset '{name}' not created: {st} {body} "
                 f"(if it's the embedding model, confirm TEI_MODEL matches {EMBEDDING})")

    # ---- persist (root-only file; never echoed) ----
    key_path = f"{STATE_DIR}/ragflow-api-key.txt"
    try:
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(api_key + "\n")
        log(f"API key written to {key_path} (mode 600)")
    except OSError as e:
        warn(f"could not write {key_path}: {e}")

    print("\n=== RAGFLOW HEADLESS CONFIG COMPLETE ===")
    print(f"base_url:   {base}")
    print(f"datasets:   {', '.join(DATASETS)}")
    print(f"embedding:  {EMBEDDING}")
    print(f"API key:    ...{api_key[-6:]} (full key only in {key_path})")
    print("Hermes uses this Bearer key against /api/v1/retrieval (no keyword:true).")


if __name__ == "__main__":
    main()
