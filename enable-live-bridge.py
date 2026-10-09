from pathlib import Path
p = Path("src-tauri/src/lib.rs")
s = p.read_text()
old = '"/api/chain/validate")'
new = '"/api/chain/validate" | "/api/chain/broadcast-live")'
if old not in s:
    raise SystemExit("STOP: expected validation-only Rust allowlist not found; no Rust changes made")
p.write_text(s.replace(old, new, 1))
print("Rust live-broadcast endpoint enabled")
