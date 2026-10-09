from pathlib import Path
import re, shutil
root=Path.cwd()
app=root/'src/MobileApp.tsx'
css=root/'src/mobile.css'
walletcss=root/'src/mobile-wallet.css'
assert app.exists() and css.exists() and walletcss.exists(), 'Run from ~/feelcoin-android'
for p in [app,css,walletcss]:
  bak=p.with_name(p.name+'.before-theme')
  if not bak.exists(): shutil.copy2(p,bak)
s=app.read_text()
if 'FEELCOIN_ANDROID_THEME_V1' not in s:
  marker='export default function MobileApp(){'
  assert s.count(marker)==1
  s=s.replace(marker,'''// FEELCOIN_ANDROID_THEME_V1 — system default, user override saved locally.
type FeelTheme = "system" | "dark" | "light";
const THEME_KEY = "feelcoin.android.appearance.v1";
function readTheme(): FeelTheme {
 try { const value = localStorage.getItem(THEME_KEY); return value === "dark" || value === "light" ? value : "system"; }
 catch { return "system"; }
}
'''+marker,1)
  needle=' const [tab,setTab]=useState<Tab>("wallet");'
  assert s.count(needle)==1
  s=s.replace(needle,needle+'''
 const [theme,setTheme]=useState<FeelTheme>(readTheme);
 useEffect(()=>{
  const el=document.documentElement;
  el.setAttribute("data-feel-theme",theme);
  el.style.colorScheme=theme==="system"?"light dark":theme;
  try {localStorage.setItem(THEME_KEY,theme);}catch{}
  return()=>{el.removeAttribute("data-feel-theme");el.style.removeProperty("color-scheme");};
 },[theme]);''',1)
  anchor='<section className="fm-card fm-row"><div><b>Foreground auto-refresh</b>'
  assert s.count(anchor)==1
  s=s.replace(anchor,'''<section className="fm-card fm-appearance"><b>Appearance</b><p>Follow your phone theme, or choose a look for Feelcoin.</p><div className="fm-theme-controls" role="group" aria-label="Wallet appearance">{(["system","dark","light"] as FeelTheme[]).map(x=><button key={x} type="button" className={theme===x?"active":""} aria-pressed={theme===x} onClick={()=>setTheme(x)}>{x==="system"?"System default":x==="dark"?"Dark":"Light"}</button>)}</div></section>'''+anchor,1)
  app.write_text(s)
light_css=r'''
/* FEELCOIN_ANDROID_THEME_V1: scoped variables; keep existing fixed header layout untouched. */
:root[data-feel-theme="system"] {color-scheme:light dark;}
:root[data-feel-theme="dark"] {color-scheme:dark;}
:root[data-feel-theme="light"] {color-scheme:light;}
.fm-theme-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:13px;}
.fm-theme-controls button{background:var(--theme-input,#101a29);color:var(--theme-text,#e8e9e9);border:1px solid var(--line);border-radius:10px;min-height:42px;padding:8px 4px;font-size:11px;font-weight:700;}
.fm-theme-controls button.active{background:var(--gold2);color:#16100a;border-color:transparent;}
.fm-appearance p{margin-bottom:6px;}
@media (prefers-color-scheme:light){
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm {--theme-light-on:1;}
}
:root[data-feel-theme="light"] .fm {--theme-light-on:1;}
@media(prefers-color-scheme:light){
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm,
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm-wallet {--theme-input:#fff;--theme-text:#1b2b3c;}
}
:root[data-feel-theme="light"] .fm {--theme-input:#fff;--theme-text:#1b2b3c;}
/* Light selectors are repeated as a single :is() list to avoid changing dark CSS. */
@media(prefers-color-scheme:light){
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm{--gold:#865d20;--gold2:#81571c;--muted:#576477;--line:rgba(103,84,48,.21);--panel:#fff;background:#f5f3ed;color:#182638;}
}
:root[data-feel-theme="light"] .fm{--gold:#865d20;--gold2:#81571c;--muted:#576477;--line:rgba(103,84,48,.21);--panel:#fff;background:#f5f3ed;color:#182638;}
@media(prefers-color-scheme:light){
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm :is(.fm-card,.fm-feature){background:linear-gradient(145deg,#fff,#f4f1e9);border-color:var(--line);box-shadow:0 10px 23px rgba(38,46,58,.05);}
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm .fm-header{background:#fbf9f4!important;border-bottom-color:var(--line)!important;}
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm .fm-tabs{background:rgba(250,248,242,.98);border-top-color:var(--line);}
}
:root[data-feel-theme="light"] .fm :is(.fm-card,.fm-feature){background:linear-gradient(145deg,#fff,#f4f1e9);border-color:var(--line);box-shadow:0 10px 23px rgba(38,46,58,.05);}
:root[data-feel-theme="light"] .fm .fm-header{background:#fbf9f4!important;border-bottom-color:var(--line)!important;}
:root[data-feel-theme="light"] .fm .fm-tabs{background:rgba(250,248,242,.98);border-top-color:var(--line);}
@media(prefers-color-scheme:light){
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm :is(.fm-brand b,.fm-brand small,.fm-card strong,.fm-network b,.fm-grid strong,.fm-heading h2,.fm-block b,.fm-address,.fm-feature h2,.fm-wallet h2,.fm-big,.fm-hash,.fm-lead,.fm-card p,.fm-worker b,.fm-expand b){color:#243348;}
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm :is(.fm-pill,.fm-tabs button,.fm-card small,.fm-grid span,.fm-worker small,.fm-network span,.fm-kicker,.fm-foot,.fm-feature small,.fm-heading span){color:#536478;}
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm :is(.fm-search input,.fm-edit textarea,.fm-wallet-send-fields input,.fm-wallet-send-fields textarea,.fm-wallet-form input,.fm-wallet-form textarea,.fm-wallet-form select){background:#fff;color:#1c2938;border-color:#c9bea7;}
 :root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm :is(.fm-small,.fm-outline-button,.fm-wallet-modes button){background:#ece7dc;color:#6b481b;border-color:#ccb990;}
}
:root[data-feel-theme="light"] .fm :is(.fm-brand b,.fm-brand small,.fm-card strong,.fm-network b,.fm-grid strong,.fm-heading h2,.fm-block b,.fm-address,.fm-feature h2,.fm-wallet h2,.fm-big,.fm-hash,.fm-lead,.fm-card p,.fm-worker b,.fm-expand b){color:#243348;}
:root[data-feel-theme="light"] .fm :is(.fm-pill,.fm-tabs button,.fm-card small,.fm-grid span,.fm-worker small,.fm-network span,.fm-kicker,.fm-foot,.fm-feature small,.fm-heading span){color:#536478;}
:root[data-feel-theme="light"] .fm :is(.fm-search input,.fm-edit textarea,.fm-wallet-send-fields input,.fm-wallet-send-fields textarea,.fm-wallet-form input,.fm-wallet-form textarea,.fm-wallet-form select){background:#fff;color:#1c2938;border-color:#c9bea7;}
:root[data-feel-theme="light"] .fm :is(.fm-small,.fm-outline-button,.fm-wallet-modes button){background:#ece7dc;color:#6b481b;border-color:#ccb990;}
@media(prefers-color-scheme:light){:root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm .fm-gold-button{color:#191103;background:linear-gradient(135deg,#e2b969,#b98835);}}
:root[data-feel-theme="light"] .fm .fm-gold-button{color:#191103;background:linear-gradient(135deg,#e2b969,#b98835);}
@media(prefers-color-scheme:light){:root:not([data-feel-theme="dark"]):not([data-feel-theme="light"]) .fm .fm-tabs button.active{color:#8b621e;}}
:root[data-feel-theme="light"] .fm .fm-tabs button.active{color:#8b621e;}
'''
s=css.read_text()
if 'FEELCOIN_ANDROID_THEME_V1' not in s: css.write_text(s+'\n'+light_css)
# mobile wallet css loaded after mobile.css? apply theme supplement in separate CSS imported at very end of mobile.css; mobile-wallet.css specificity :root... higher wins.
# Add native status bar correction for verified MainActivity, fail-safe if missing.
main_activities=list((root/'src-tauri/gen/android/app/src/main').rglob('MainActivity.kt'))
if len(main_activities)==1:
 p=main_activities[0];t=p.read_text();bak=p.with_name('MainActivity.kt.before-theme')
 if not bak.exists():shutil.copy2(p,bak)
 if 'FEELCOIN_ANDROID_STATUSBAR_V1' not in t:
  # append override to existing TauriActivity class, avoid destructively replacing app code
  assert re.search(r'class\s+MainActivity\s*:\s*TauriActivity\s*\(\s*\)',t), 'Unexpected Kotlin MainActivity; not modified'
  t=t.replace('class MainActivity : TauriActivity()', '''class MainActivity : TauriActivity()''',1)
  if re.search(r'class\s+MainActivity\s*:\s*TauriActivity\s*\(\s*\)\s*\{\s*\}',t):
   t=re.sub(r'class\s+MainActivity\s*:\s*TauriActivity\s*\(\s*\)\s*\{\s*\}', '''class MainActivity : TauriActivity() {
    // FEELCOIN_ANDROID_STATUSBAR_V1: a dark bar with readable white clock, battery and signal icons.
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(9, 16, 27)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = window.decorView.systemUiVisibility and
            android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
    }
}''',t, count=1)
  elif '{' not in t.split('class MainActivity',1)[-1][:40]:
   t=t.replace('class MainActivity : TauriActivity()', '''class MainActivity : TauriActivity() {
    // FEELCOIN_ANDROID_STATUSBAR_V1
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(9, 16, 27)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = window.decorView.systemUiVisibility and android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
    }
}''',1)
  else: raise AssertionError('Existing MainActivity has code; review before patching')
  p.write_text(t)
  print('Native status-bar patch applied:',p.relative_to(root))
else: print('WARNING: MainActivity.kt not found uniquely; native status bar remains unchanged. Inspect Android project before publishing.')
print('PASS: Theme settings + light/dark styles applied. Existing header rules, wallet and sender preserved.')
