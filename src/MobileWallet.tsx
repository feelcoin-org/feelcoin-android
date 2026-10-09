import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  feelcoinCore, generateWallet, openWallet, recoverWallet, saveWallet, walletNames, type LocalWallet
} from "./mobileWallet";
import "./mobile-wallet.css";

type Mode = "open" | "create" | "recover";
type Opened = { name: string; address: string; restoreHeight: number };
type Progress = { scannedHeight: number; chainHeight: number; ownedOutputs: number };
type PendingTx = { txid:string; amount:string; submittedAt:number };
function pendingKey(address:string){return "feelcoin.android.pending.v1."+address;}
function readPending(address:string):PendingTx[]{
  try {const v=JSON.parse(localStorage.getItem(pendingKey(address))||"[]");
    return Array.isArray(v)?v.filter((x:unknown)=>{const t=x as Partial<PendingTx>;return typeof t.txid==="string"&&/^[0-9a-f]{64}$/i.test(t.txid)&&typeof t.amount==="string"&&/^\d+$/.test(t.amount)&&typeof t.submittedAt==="number"&&Number.isFinite(t.submittedAt);}).slice(-100):[];
  } catch{return [];}
}
function writePending(address:string,rows:PendingTx[]){try{localStorage.setItem(pendingKey(address),JSON.stringify(rows.slice(-100)));}catch{}}
function atomicFromFeel(value:string):string {const [whole,frac=""]=value.split(".");return (BigInt(whole)*1000000000000n+BigInt((frac+"000000000000").slice(0,12))).toString();}
 type ScanResult = {
  ownedOutputs?: unknown[]; incoming?: unknown[]; outgoing?: unknown[]; lastBlockHash?: string | null; restoreHeight?: number;
  scannedHeight: number; chainHeight: number; balance: bigint | null;
  unlockedBalance: bigint; history: Array<{height?:number;timestamp?:number;txid?:string;amount?:bigint;type?:string}>;
};
type ScannerGlobal = { scanWallet: (args:{core:unknown;wallet:LocalWallet;previousResult:ScanResult|null;onProgress:(p:Progress)=>void;onCheckpoint?:(checkpoint:ScanResult)=>void})=>Promise<ScanResult> };
declare global { interface Window {
  FeelcoinAndroidChainRequest: (path:string,method:string,body:unknown)=>Promise<unknown>;
  FeelcoinScanner?: ScannerGlobal;
  FeelcoinSend?: {sendFeel:()=>Promise<{tx_hash?:string;validated?:boolean;isolated?:boolean;broadcasted?:boolean}|undefined>};
  FeelcoinWalletRuntime?: {getWallet:()=>LocalWallet|null;getCore:()=>unknown};
  FeelcoinDashboard?: {getLastResult:()=>ScanResult|null};
  FEELCOIN_NETWORK?: Record<string,number>;
} }
function loadScript(src:string):Promise<void> {
  if (document.querySelector(`script[data-feel-src="${src}"]`)) return Promise.resolve();
  return new Promise((resolve,reject)=>{const el=document.createElement("script");el.src=src;el.dataset.feelSrc=src;el.onload=()=>resolve();el.onerror=()=>reject(new Error("Wallet integration script unavailable"));document.head.appendChild(el);});
}
function amountText(v:bigint|null|undefined):string {
  if(v===null||v===undefined)return "—";
  const x=v.toString().padStart(13,"0");return `${x.slice(0,-12)}.${x.slice(-12).replace(/0+$/,"")||"0"}`;
}


// Checkpoints contain transaction metadata and key images, never wallet seeds
// or private keys. Android device storage must remain protected; future public
// releases should migrate these records to encrypted at-rest storage.
const CHECKPOINT_VERSION = 1;
function checkpointKey(address:string):string { return "feelcoin.android.scan.v1."+address; }
function saveCheckpoint(address:string, state:ScanResult):void {
  try {
    const raw=JSON.stringify({version:CHECKPOINT_VERSION,address,state},(_key,value)=>
      typeof value==="bigint"?{__feelcoinBigInt:value.toString()}:value);
    localStorage.setItem(checkpointKey(address),raw);
  } catch(error) { console.warn("Could not save Feelcoin scan checkpoint",error); }
}
function loadCheckpoint(address:string):ScanResult|null {
  try {
    const raw=localStorage.getItem(checkpointKey(address));
    if(!raw)return null;
    const entry=JSON.parse(raw,(_key,value)=>
      value && typeof value==="object" && Object.keys(value).length===1 &&
      typeof value.__feelcoinBigInt==="string" && /^-?\d+$/.test(value.__feelcoinBigInt)
        ?BigInt(value.__feelcoinBigInt):value);
    const state=entry?.state as ScanResult|undefined;
    if(entry.version!==CHECKPOINT_VERSION||entry.address!==address||
      !state||!Number.isSafeInteger(state.scannedHeight)||state.scannedHeight<0||
      !Array.isArray(state.ownedOutputs)||!Array.isArray(state.incoming)||
      !Array.isArray(state.outgoing)||typeof state.lastBlockHash!=="string")return null;
    return state;
  } catch {return null;}
}
export default function MobileWallet() {
  const [mode, setMode] = useState<Mode>("create");
  const [knownWallets, setKnownWallets] = useState<string[]>(() => walletNames());
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [height, setHeight] = useState("0");
  const [backupWords, setBackupWords] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);
  const [coreStatus, setCoreStatus] = useState("Preparing offline wallet engine…");
  const [coreErrorCode, setCoreErrorCode] = useState("");
  const [message, setMessage] = useState("");
  const [syncStatus,setSyncStatus]=useState("Not synchronized");
  const [progress,setProgress]=useState<Progress|null>(null);
  const [scan,setScan]=useState<ScanResult|null>(null);
  const [sendAddress,setSendAddress]=useState("");
  const [sendAmount,setSendAmount]=useState("");
  const [sending,setSending]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [pending,setPending]=useState<PendingTx[]>([]);
  const refreshRef=useRef<()=>void>(()=>{});
  const [walletTab,setWalletTab]=useState<"receive"|"send"|"history">("receive");
  const walletRef=useRef<LocalWallet|null>(null);
  const scanRef=useRef<ScanResult|null>(null);
  const coreRef=useRef<unknown>(null);
  const runId=useRef(0);

  useEffect(() => {
    let active = true;
    void feelcoinCore()
      .then(() => { if (active) { setCoreStatus("Local Feelcoin crypto engine ready"); setCoreErrorCode(""); } })
      .catch((error: unknown) => {
        if (!active) return;
        setCoreStatus("Local crypto initialization failed — report diagnostic code");
        const code = error instanceof Error ? error.message : "ENGINE_INIT_UNKNOWN";
        // Only display fixed diagnostic identifiers; never reveal wallet secrets.
        setCoreErrorCode(/^ENGINE_[A-Z_]+$/.test(code) ? code : "ENGINE_INIT_OTHER");
      });
    return () => { active = false; };
  }, []);

  useEffect(()=>{
    if(!opened)return;
    let active=true;
    const id=++runId.current;
    setPending(readPending(opened.address));
    const cached=loadCheckpoint(opened.address);
    if(cached && cached.scannedHeight>=opened.restoreHeight){
      scanRef.current=cached;
      // Partial checkpoints are never a verified balance.
      if(typeof cached.balance==="bigint")setScan(cached);
      setProgress({scannedHeight:cached.scannedHeight,chainHeight:cached.chainHeight,ownedOutputs:cached.ownedOutputs?.length??0});
      setSyncStatus("Resuming saved scan…");
    }
    const initialize=async()=>{
      try {
        window.FeelcoinAndroidChainRequest=(path,method,body)=>invoke("mobile_chain_request",{path,method,body});
        window.FEELCOIN_NETWORK=Object.freeze({forkVersion:16,targetSeconds:120,spendableAge:10,maxBlockNumber:500000000,unlockDeltaBlocks:1,unlockDeltaSeconds:120});
        coreRef.current=await feelcoinCore();
        window.FeelcoinWalletRuntime={getWallet:()=>walletRef.current,getCore:()=>coreRef.current};
        window.FeelcoinDashboard={getLastResult:()=>scanRef.current};
        await loadScript("/wallet-integration/scanner.js");
        await loadScript("/wallet-integration/send.js");
      }catch(error){if(active)setSyncStatus(`Scanner initialization failed: ${String(error)}`);}
    };
    let scanning=false;
    const synchronize=async()=>{
      if(scanning)return;
      if(!active||runId.current!==id||!walletRef.current||!window.FeelcoinScanner)return;
      scanning=true;
      try {
        // Retain the completed status during routine checks to avoid UI flicker.
        if(!scanRef.current || scanRef.current.scannedHeight<scanRef.current.chainHeight)
          setSyncStatus("Synchronizing…");
        const result=await window.FeelcoinScanner.scanWallet({core:coreRef.current,wallet:walletRef.current,previousResult:scanRef.current,onProgress:p=>{if(active&&runId.current===id)setProgress(p);},onCheckpoint:checkpoint=>{
          if(!active||runId.current!==id)return;
          saveCheckpoint(opened.address,checkpoint);
          // Keep intermediate scanner state resumable even if connectivity fails.
          scanRef.current=checkpoint;
        }});
        if(active&&runId.current===id){
          scanRef.current=result;saveCheckpoint(opened.address,result);setScan(result);
          setProgress({scannedHeight:result.scannedHeight,chainHeight:result.chainHeight,ownedOutputs:result.ownedOutputs?.length??0});
          setSyncStatus(result.scannedHeight>=result.chainHeight?"Synchronized":"Syncing…");
          // A pending transaction is retained until the scanner independently detects it.
          // Do not label it confirmed just because the broadcast endpoint accepted it.
          setPending(readPending(opened.address));
        }
      }catch(error){if(active&&runId.current===id)setSyncStatus(`Sync error: ${String(error)}`);}
      finally{scanning=false; if(active&&runId.current===id)setRefreshing(false);}
    };
    refreshRef.current=()=>{if(active && !scanning){setRefreshing(true);void synchronize();}};
    void initialize().then(()=>{if(active)void synchronize();});
    const interval=window.setInterval(()=>{if(active)void synchronize();},30000);
    return()=>{active=false;refreshRef.current=()=>{};window.clearInterval(interval);++runId.current;};
  },[opened]);

  async function transfer(){
    if(!scanRef.current||scanRef.current.scannedHeight<scanRef.current.chainHeight){setMessage("Wait until wallet synchronization completes.");return;}
    if(!/^\d+(?:\.\d{1,12})?$/.test(sendAmount)||!sendAddress.trim()){setMessage("Enter a valid recipient address and FEEL amount.");return;}
    if(!window.FeelcoinSend){setMessage("Transaction signer is not ready.");return;}
    setSending(true);setMessage("");
    try {
      const result=await window.FeelcoinSend.sendFeel();
      if(result?.broadcasted===true){
        const hash=result.tx_hash||"";
        if(/^[0-9a-f]{64}$/i.test(hash) && opened){
          const item:PendingTx={txid:hash.toLowerCase(),amount:atomicFromFeel(sendAmount),submittedAt:Date.now()};
          const updated=[...readPending(opened.address).filter(p=>p.txid!==item.txid),item];
          writePending(opened.address,updated);setPending(updated);
        }
        setMessage("Transaction submitted to the Feelcoin network. Hash: "+(hash||"not returned by signer"));
        setSendAddress("");setSendAmount("");
        // Preserve previous balance/history until a fresh scan is complete.
        setSyncStatus("Refreshing after transfer…");
        refreshRef.current();
      }
    }catch(error){setMessage("Transfer could not be confirmed. Check history before retrying: "+String(error));}
    finally{setSending(false);}
  }

  function reset(modeNext: Mode) {
    setMode(modeNext);
    setName("");
    setPassword("");
    setConfirmPassword("");
    setMnemonic("");
    setHeight("0");
    setMessage("");
    setBackupWords("");
    setBackedUp(false);
    walletRef.current=null;scanRef.current=null;setScan(null);setPending([]);setSyncStatus("Not synchronized");setOpened(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Enter a wallet name.");
      if (!password) throw new Error("Enter your local wallet password.");
      if (mode !== "open" && password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      if (mode === "open") {
        const wallet = await openWallet(cleanName, password);
        walletRef.current=wallet;
        setOpened({ name: cleanName, address: wallet.address, restoreHeight: wallet.restoreHeight });
      } else {
        const wallet = mode === "create"
          ? await generateWallet()
          : await recoverWallet(mnemonic, Number(height));
        await saveWallet(cleanName, password, wallet);
        setKnownWallets(walletNames());
        if (mode === "create") {
          setBackupWords(wallet.mnemonic);
          setBackedUp(false);
        } else {
          walletRef.current=wallet;
        setOpened({ name: cleanName, address: wallet.address, restoreHeight: wallet.restoreHeight });
        }
      }
      setPassword("");
      setConfirmPassword("");
      setMnemonic("");
    } catch (error) {
      const info = error instanceof Error ? error.message : "Wallet operation failed.";
      // Never display crypto-engine-provided details that might echo user seed material.
      setMessage(/engine|mnemonic|wasm/i.test(info) ? "Local wallet engine failed (" + (coreErrorCode || "ENGINE_OPERATION") + "). Never share seed or keys." : info);
    } finally {
      setBusy(false);
    }
  }

  const chooseMode = (next: Mode) => { reset(next); };
  const confirmedHashes=new Set((scan?.history||[]).filter(i=>i.type==="out" && typeof i.height==="number").map(i=>String(i.txid||"").toLowerCase()));
  const pendingRows=pending.filter(p=>!confirmedHashes.has(p.txid));
  const historyRows=[...(scan?.history||[]).map(item=>({
    type:item.type||"transaction",txid:item.txid||"",height:item.height,amount:typeof item.amount==="bigint"?item.amount:null,
    timestamp:item.timestamp||0,pending:false
  })),...pendingRows.map(p=>({type:"out",txid:p.txid,height:undefined,amount:BigInt(p.amount),timestamp:Math.floor(p.submittedAt/1000),pending:true}))]
  .sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).slice(0,50);
  if (opened) return (
    <>
      <p className="fm-kicker">LOCAL WALLET • PRIVATE DEVICE TEST</p>
      <h1>Your <em>Wallet.</em></h1>
      <section className="fm-feature fm-wallet">
        <img src="/feelcoin-logo.png" alt="Feelcoin official gold coin" />
        <div className="fm-green">● Encrypted wallet unlocked locally</div>
        <h2>{opened.name}</h2>
        <small>YOUR FEEL RECEIVING ADDRESS</small>
        <p className="fm-address fm-wrap">{opened.address}</p>
        <button className="fm-outline-button" onClick={() => void navigator.clipboard.writeText(opened.address).then(() => setMessage("Public receiving address copied.")).catch(() => setMessage("Clipboard unavailable."))}>
          Copy receiving address
        </button>
      </section>
      <section className="fm-card fm-network">
        <div><span>Wallet storage</span><b>Local • password-encrypted</b></div>
        <div><span>Key generation</span><b>On device</b></div>
        <div><span>Restore height</span><b>{opened.restoreHeight.toLocaleString()}</b></div>
        <div><span>Sync status</span><b>{syncStatus}</b></div>

        <div><span>Scan progress</span><b>{progress?`${progress.scannedHeight} / ${progress.chainHeight}`:"—"}</b></div>
        <div><span>Current balance</span><b>{amountText(scan?.balance)} FEEL</b></div>
        <div><span>Unlocked balance</span><b>{amountText(scan?.unlockedBalance)} FEEL</b></div>
      </section>
      <div className="fm-wallet-modes">{(["receive","send","history"] as const).map(t=><button key={t} type="button" className={walletTab===t?"active":""} onClick={()=>setWalletTab(t)}>{t.toUpperCase()}</button>)}<button type="button" className="fm-refresh-tab" disabled={refreshing} onClick={()=>refreshRef.current()}>{refreshing?"Refreshing…":"↻ REFRESH"}</button></div>
      {walletTab==="receive"&&<section className="fm-card"><strong>Receive FEEL</strong><p className="fm-address fm-wrap">{opened.address}</p><p>Share this public address with the sender. Confirm incoming funds after synchronization.</p></section>}
      {walletTab==="history"&&<section className="fm-card fm-history"><strong>Transaction history</strong>{historyRows.length?historyRows.map((item,i)=><div key={`${item.txid}-${item.type}-${i}`} className="fm-history-item"><div className="fm-history-head"><strong>{item.type==="out"?"↗ SENT":item.type==="in"?"↙ RECEIVED":"TRANSACTION"}</strong><span>{item.pending?"Pending · submitted":item.height!==undefined?`Block ${item.height}`:"Unconfirmed"}</span></div><div className="fm-history-amount">{item.type==="out"?"−":item.type==="in"?"+":""}{amountText(item.amount)} FEEL</div><div className="fm-history-hash">{item.txid||"—"}</div></div>):<p>{scan?"No wallet transactions detected.":"Synchronize the wallet to see transactions."}</p>}<p className="fm-history-note">Pending means locally recorded after network submission; it does not guarantee confirmation. History updates when the blockchain scanner detects a transaction.</p></section>}
      {walletTab==="send"&&<section className="fm-card"><h2>Send FEEL</h2><div className="fm-wallet-send-fields"><label htmlFor="sendAddress">Recipient address</label><textarea id="sendAddress" rows={3} value={sendAddress} onChange={e=>setSendAddress(e.target.value)} autoComplete="off" spellCheck={false}/><label htmlFor="sendAmount">Amount (FEEL)</label><input id="sendAmount" value={sendAmount} onChange={e=>setSendAmount(e.target.value)} inputMode="decimal"/></div><p>LIVE TRANSFER: Verify recipient, amount and network fee before confirming. The signed transaction will be broadcast to the network.</p><button className="fm-gold-button" disabled={sending||!scan||scan.scannedHeight<scan.chainHeight||typeof scan.balance!=="bigint"} onClick={()=>void transfer()}>{sending?"Signing…":"Review and send FEEL"}</button><p id="sendMessage" role="status"/></section>}
      <p className="fm-lead">Android Beta. Start with a small transfer and keep your recovery seed backed up securely.</p>
      <button className="fm-gold-button" onClick={() => reset("open")}>Lock wallet</button>
      {message && <p className="fm-wallet-message" role="status">{message}</p>}
    </>
  );

  if (backupWords) return (
    <>
      <p className="fm-kicker">IMPORTANT • WALLET BACKUP</p>
      <h1>Save your <em>Seed.</em></h1>
      <section className="fm-feature">
        <strong>Write down these words in order, privately.</strong>
        <p className="fm-wallet-warning">Never share your recovery phrase, photograph it, or paste it into an online website. Anyone with these words can spend your coins.</p>
        <div className="fm-recovery-phrase">{backupWords}</div>
        <label className="fm-wallet-check"><input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} /> I have securely backed up my recovery seed.</label>
        <button className="fm-gold-button" disabled={!backedUp} onClick={() => {
          setBackupWords(""); setBackedUp(false);
          setMessage("Wallet encrypted on device. Open it using your name and password.");
          setMode("open"); setName("");
        }}>I saved my seed — continue</button>
      </section>
    </>
  );

  return (
    <>
      <p className="fm-kicker">YOUR KEYS. YOUR DEVICE.</p>
      <h1>Your <em>Wallet.</em></h1>
      <p className="fm-lead">Create, open or restore a FEEL wallet within this app. No local daemon, no account registration, and no recovery seed sent to the server.</p>
      <div className="fm-wallet-modes">
        {(["create", "open", "recover"] as Mode[]).map(tab => (
          <button type="button" key={tab} onClick={() => chooseMode(tab)} className={mode === tab ? "active" : ""}>
            {tab === "create" ? "Create" : tab === "open" ? "Open" : "Recover"}
          </button>
        ))}
      </div>
      <section className="fm-card">
        <p className="fm-wallet-engine">◈ {coreStatus}{coreErrorCode ? ` (diagnostic: ${coreErrorCode})` : ""}</p>
        <form className="fm-wallet-form" onSubmit={event => void submit(event)} autoComplete="off">
          <label htmlFor="feel-wallet-name">Wallet name</label>
          {mode === "open" && knownWallets.length > 0 ? (
            <select id="feel-wallet-name" value={name} onChange={e => setName(e.target.value)} required>
              <option value="">Select saved wallet</option>
              {knownWallets.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input id="feel-wallet-name" value={name} onChange={e => setName(e.target.value)} maxLength={64} autoCapitalize="none" placeholder="my-feel-wallet" required />
          )}
          {mode === "recover" && (
            <>
              <label htmlFor="feel-seed">Recovery seed words</label>
              <textarea id="feel-seed" value={mnemonic} onChange={e => setMnemonic(e.target.value)} placeholder="Enter your Feelcoin recovery words in order" rows={4} spellCheck={false} autoComplete="off" required />
              <label htmlFor="feel-restore-height">Restore height</label>
              <input id="feel-restore-height" type="number" min="0" step="1" value={height} onChange={e => setHeight(e.target.value)} /><p className="fm-field-help">0 = scan from genesis. If you know when your wallet first received FEEL, enter a block height at or before that point. Choosing a later height can miss funds.</p>
            </>
          )}
          <label htmlFor="feel-wallet-password">{mode === "open" ? "Wallet password" : "New wallet password (10+ characters)"}</label>
          <input id="feel-wallet-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" required />
          {mode !== "open" && (
            <>
              <label htmlFor="feel-wallet-password2">Confirm password</label>
              <input id="feel-wallet-password2" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="off" required />
            </>
          )}
          <button type="submit" className="fm-gold-button" disabled={busy}>
            {busy ? "Working locally…" : mode === "create" ? "Create local wallet" : mode === "open" ? "Unlock wallet" : "Recover wallet locally"}
          </button>
        </form>
        {message && <p className="fm-wallet-message" role="alert">{message}</p>}
      </section>
      <section className="fm-card">
        <b>Private beta • local wallet test</b>
        <p>Passwords and private keys are stored only in a password-encrypted device vault. Android Keystore integration and full device recovery testing are pending. Test with small amounts; do not use significant funds.</p>
      </section>
    </>
  );
}
