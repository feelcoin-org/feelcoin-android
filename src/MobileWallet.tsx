import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { scan as scanBarcode, requestPermissions, Format } from "@tauri-apps/plugin-barcode-scanner";
import jsQR from "jsqr";
import * as QRCode from "qrcode";
import { parseFeelcoinQr } from "./feelcoinQr";
import { syncPercent, syncRate, syncRemaining, syncEta, formatSyncEta, type SyncSample } from "./walletSyncMetrics";
import { loadScanCheckpoint, saveScanCheckpoint } from "./walletScanStorage";
import { selectedKeyImages, type SignInput } from "./walletSelectedInputs";
import {
  feelcoinCore, generateWallet, openWallet, recoverWallet, saveWallet, walletNames, type LocalWallet
} from "./mobileWallet";
import "./mobile-wallet.css";
import "./walletPullRefresh.css";

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
  verified?: boolean; fastPath?: boolean; watchOnly?: boolean;
  unspent?: Array<{keyImage?:string}>;
  unlockedOutputs?: Array<{keyImage?:string;globalIndex?:number|string|null;outputPublicKey?:string;spent?:boolean;unlocked?:boolean}>;
  timings?: {heightMs:number;tipMs:number;blocksMs:number;verificationMs:number;totalMs:number;
    coinbaseMs?:number;spentStatusMs?:number;spentBatches?:number};
};
type ScannerGlobal = { scanWallet: (args:{core:unknown;wallet:LocalWallet;previousResult:ScanResult|null;onProgress:(p:Progress)=>void;onCheckpoint?:(checkpoint:ScanResult)=>void;onPhase?:(phase:"scanning"|"verifying")=>void;forceVerify?:boolean})=>Promise<ScanResult> };
declare global { interface Window {
  FeelcoinAndroidChainRequest: (path:string,method:string,body:unknown)=>Promise<unknown>;
  FeelcoinScanner?: ScannerGlobal;
  FeelcoinSend?: {sendFeel:(options?:{onStage?:(event:{phase:string;elapsedMs:number;
    previousPhase:string|null;previousStageMs:number})=>void;
    validateSelectedInputs?:(params:{usingOuts:SignInput[]})=>Promise<void>})=>Promise<
    {tx_hash?:string;validated?:boolean;isolated?:boolean;broadcasted?:boolean}|undefined>};
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


// Scan metadata contains transaction details and key images, NEVER mnemonic
// words or private keys. The encrypted wallet vault remains separate.
// Prefer IndexedDB (larger, transactional) to localStorage for scan state.
// FEELCOIN_DURABLE_SCAN_CHECKPOINT_V3
// FEELCOIN_CREATE_FAST_HEIGHT_V2
// A new wallet can scan near its birth height. Never apply to seed recovery.
// If either official API is unavailable, stale, or disagrees, scan from genesis.
const NEW_WALLET_HEIGHT_CUSHION = 120;
async function safeNewWalletStart(): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const heights = Promise.allSettled([
      invoke<{height?:number; synchronized?:boolean}>("mobile_chain_request", {path:"/api/health", method:"GET", body:null}),
      invoke<{info?:{height?:number; synchronized?:boolean}}>("mobile_explorer_home")
    ]);
    const results = await Promise.race([
      heights,
      new Promise<null>(resolve => { timeout=setTimeout(()=>resolve(null),6000); })
    ]);
    if (!results || results.some(r => r.status !== "fulfilled")) return 0;
    const a=results[0].status === "fulfilled" ? results[0].value : null;
    const b=results[1].status === "fulfilled" ? results[1].value.info : null;
    const ha=a?.height, hb=b?.height;
    if(a?.synchronized === false || b?.synchronized === false ||
       typeof ha !== "number" || typeof hb !== "number" ||
       !Number.isSafeInteger(ha) || !Number.isSafeInteger(hb) ||
       ha <= NEW_WALLET_HEIGHT_CUSHION || hb <= NEW_WALLET_HEIGHT_CUSHION ||
       Math.abs(ha-hb)>12) return 0;
    return Math.max(0,Math.min(ha,hb)-NEW_WALLET_HEIGHT_CUSHION);
  } catch { return 0; }
  finally { if(timeout!==undefined) clearTimeout(timeout); }
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
  const [syncPhase,setSyncPhase]=useState<"idle"|"connecting"|"scanning"|"synced"|"error">("idle");
  const [freshSync,setFreshSync]=useState(false);
  const [checkpointState,setCheckpointState]=useState<"checking"|"saved"|"failed">("checking");
  const [lastSavedHeight,setLastSavedHeight]=useState<number|null>(null);
  const [lastAdvanceAt,setLastAdvanceAt]=useState<number|null>(null);
  const [syncRateValue,setSyncRateValue]=useState<number|null>(null);
  const [nextRetryAt,setNextRetryAt]=useState<number|null>(null);
  const [syncClock,setSyncClock]=useState(Date.now());
  const samplesRef=useRef<SyncSample[]>([]);
  const [progress,setProgress]=useState<Progress|null>(null);
  const [scan,setScan]=useState<ScanResult|null>(null);
  const [sendAddress,setSendAddress]=useState("");
  const [sendAmount,setSendAmount]=useState("");
  const [qrBusy,setQrBusy]=useState(false);
  const [qrImage,setQrImage]=useState("");
  const qrFile=useRef<HTMLInputElement|null>(null);
  const [sending,setSending]=useState(false);
  const [sendSucceeded,setSendSucceeded]=useState(false);
  const sendingRef=useRef(false);
  const [sendStage,setSendStage]=useState("");
  const [sendDiagnostics,setSendDiagnostics]=useState("");
  const [refreshing,setRefreshing]=useState(false);
  const [lastCheck,setLastCheck]=useState<string>("");
  const [pending,setPending]=useState<PendingTx[]>([]);
  const refreshRef=useRef<(force?:boolean)=>void>(()=>{});
  const [walletTab,setWalletTab]=useState<"receive"|"send"|"history">("receive");
  const walletRef=useRef<LocalWallet|null>(null);
  const scanRef=useRef<ScanResult|null>(null);
  const coreRef=useRef<unknown>(null);
  const runId=useRef(0);
  // FEELCOIN_PULL_TO_REFRESH_V1: gesture is available only on the unlocked
  // Wallet screen, not during seed backup or on other app tabs.
  const [pullDistance,setPullDistance]=useState(0);
  const [pullRefreshing,setPullRefreshing]=useState(false);
  const pullDistanceRef=useRef(0);
  useEffect(()=>{
    if(!opened){setPullDistance(0);setPullRefreshing(false);return;}
    let gesture:{x:number;y:number}|null=null;
    const clear=()=>{gesture=null;pullDistanceRef.current=0;setPullDistance(0);};
    const eligible=(target:EventTarget|null):target is Element=>{
      if(!(target instanceof Element))return false;
      const pane=document.querySelector<HTMLElement>(".fm-wallet-persistent");
      if(!pane || !pane.contains(target) || getComputedStyle(pane).display==="none")return false;
      if(target.closest("button,input,textarea,select,label,a,[role='button'],[contenteditable='true']"))return false;
      // Never hijack the normal downward scroll when the page (or a nested
      // scroll surface) is not at its very top.
      if((document.scrollingElement?.scrollTop??0)>2 || window.scrollY>2)return false;
      for(let element:Element|null=target;element && element!==document.body;element=element.parentElement){
        if(element.scrollTop>2 && element.scrollHeight>element.clientHeight+2)return false;
      }
      return true;
    };
    const onStart=(event:TouchEvent)=>{
      clear();
      if(event.touches.length!==1 || refreshing || sending || qrBusy || pullRefreshing || !eligible(event.target))return;
      const touch=event.touches[0];
      gesture={x:touch.clientX,y:touch.clientY};
    };
    const onMove=(event:TouchEvent)=>{
      if(!gesture || event.touches.length!==1)return;
      const touch=event.touches[0];
      const dy=touch.clientY-gesture.y;
      const dx=Math.abs(touch.clientX-gesture.x);
      if(dy<0 || dx>Math.max(30,dy*.65)){clear();return;}
      const distance=Math.min(95,Math.max(0,dy*.65));
      pullDistanceRef.current=distance;
      setPullDistance(distance);
    };
    const onEnd=(event:TouchEvent)=>{
      if(!gesture)return;
      const shouldRefresh=event.touches.length===0 && pullDistanceRef.current>=65 &&
        (document.scrollingElement?.scrollTop??0)<=2 && !refreshing && !sending && !qrBusy;
      clear();
      if(shouldRefresh){
        setPullRefreshing(true);
        // Same non-forced fast check as the existing Refresh button.
        refreshRef.current(false);
      }
    };
    document.addEventListener("touchstart",onStart,{passive:true});
    document.addEventListener("touchmove",onMove,{passive:true});
    document.addEventListener("touchend",onEnd,{passive:true});
    document.addEventListener("touchcancel",clear,{passive:true});
    return()=>{
      document.removeEventListener("touchstart",onStart);
      document.removeEventListener("touchmove",onMove);
      document.removeEventListener("touchend",onEnd);
      document.removeEventListener("touchcancel",clear);
    };
  },[opened,refreshing,sending,qrBusy,pullRefreshing]);
  useEffect(()=>{
    if(pullRefreshing && !refreshing)setPullRefreshing(false);
  },[pullRefreshing,refreshing]);
  useEffect(()=>{
    if(!opened)return;
    const timer=window.setInterval(()=>setSyncClock(Date.now()),5000);
    return ()=>window.clearInterval(timer);
  },[opened]);

  // Only the public address is encoded. Seed/private keys never leave the device.
  useEffect(()=>{
    let alive=true;
    if (!opened?.address) {setQrImage("");return;}
    void QRCode.toDataURL(opened.address,{width:300,margin:2,color:{dark:"#0f1419",light:"#ffffff"}})
      .then(url=>{if(alive)setQrImage(url);})
      .catch(()=>{if(alive)setQrImage("");});
    return ()=>{alive=false;};
  },[opened?.address]);

  function useScannedCode(code:string){
    try {
      const next=parseFeelcoinQr(code);
      setSendSucceeded(false);
      setSendAddress(next.address);
      if(next.amount !== undefined) setSendAmount(next.amount);
      setMessage("QR scanned. Check recipient and amount before sending.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unrecognized QR code.");}
  }

  async function scanCamera(){
    if(qrBusy)return;
    setQrBusy(true);setMessage("");
    try {
      const permission=await requestPermissions();
      if(permission !== "granted") {setMessage("Camera permission is required to scan a QR code.");return;}
      const result=await scanBarcode({formats:[Format.QRCode],cameraDirection:"back",windowed:false});
      useScannedCode(result.content);
    }catch(error){
      // Cancellation and permission errors are not transaction failures.
      setMessage("QR scanner closed or unavailable. You can paste an address or use a gallery image.");
    }finally{setQrBusy(false);}
  }

  async function scanGallery(file:File | undefined){
    if(!file)return;
    setQrBusy(true);setMessage("");
    try {
      if(!file.type.startsWith("image/") || file.size>12_000_000) throw new Error("Choose an image under 12 MB.");
      const image=await createImageBitmap(file);
      try {
        const scale=Math.min(1,1800/Math.max(image.width,image.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(image.width*scale));
        canvas.height=Math.max(1,Math.round(image.height*scale));
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        if(!ctx)throw new Error("Image scanning is unavailable.");
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        const code=jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:"attemptBoth"});
        if(!code)throw new Error("No QR code found in this picture.");
        useScannedCode(code.data);
      }finally{image.close();}
    }catch(error){setMessage(error instanceof Error?error.message:"Could not scan this image.");}
    finally{setQrBusy(false);if(qrFile.current)qrFile.current.value="";}
  }

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
    let scanning=false;
    let ready=false;
    let durableVerified=false;
    let forcePending=false;
    const isCurrent=()=>active && runId.current===id;
    setPending(readPending(opened.address));
    setFreshSync(false);
    setSyncPhase("connecting");
    setSyncStatus("Connecting to network…");
    setNextRetryAt(null);
    setLastAdvanceAt(null);
    setSyncRateValue(null);
    samplesRef.current=[];
    setLastCheck("");

    setCheckpointState("checking");
    setLastSavedHeight(null);
    const initialize=async()=>{
      try {
        // Load the last committed scan before the scanner begins. If a wallet
        // has been recovered with an EARLIER restore height, ignore old state:
        // it could skip transactions that predate the old checkpoint.
        const cached=await loadScanCheckpoint<ScanResult>(opened.address);
        if(!isCurrent())return false;
        if(cached && cached.restoreHeight===opened.restoreHeight && cached.scannedHeight>=opened.restoreHeight){
          scanRef.current=cached;
          durableVerified=cached.verified===true;
          if(typeof cached.balance==="bigint")setScan(cached);
          setProgress({scannedHeight:cached.scannedHeight,chainHeight:cached.chainHeight,ownedOutputs:cached.ownedOutputs?.length??0});
          setCheckpointState("saved");
          setLastSavedHeight(cached.scannedHeight);
          setSyncStatus("Restoring saved checkpoint…");
        } else {
          scanRef.current=null;
          durableVerified=false;
          setScan(null);
          setProgress(null);
        }
        window.FeelcoinAndroidChainRequest=(path,method,body)=>invoke("mobile_chain_request",{path,method,body});
        window.FEELCOIN_NETWORK=Object.freeze({forkVersion:16,targetSeconds:120,spendableAge:10,maxBlockNumber:500000000,unlockDeltaBlocks:1,unlockDeltaSeconds:120});
        coreRef.current=await feelcoinCore();
        if(!isCurrent())return false;
        window.FeelcoinWalletRuntime={getWallet:()=>walletRef.current,getCore:()=>coreRef.current};
        window.FeelcoinDashboard={getLastResult:()=>scanRef.current};
        await loadScript("/wallet-integration/scanner.js");
        await loadScript("/wallet-integration/send.js");
        if(!window.FeelcoinScanner?.scanWallet)throw new Error("SCANNER_UNAVAILABLE");
        ready=true;
        return true;
      }catch{
        if(isCurrent()){
          setSyncPhase("error");
          setSyncStatus("Wallet scanner unavailable. Reopen wallet or check app installation.");
        }
        return false;
      }
    };

    const onScanProgress=(p:Progress)=>{
      if(!isCurrent() || !Number.isSafeInteger(p.scannedHeight) || p.scannedHeight<0 ||
         !Number.isSafeInteger(p.chainHeight) || p.chainHeight<=0)return;
      const now=Date.now();
      setProgress(p);
      setSyncPhase("scanning");
      setSyncStatus("Scanning blockchain…");
      setNextRetryAt(null);
      const samples=samplesRef.current;
      const last=samples[samples.length-1];
      if(!last || p.scannedHeight>last.height){
        // Reorgs or lower scanned heights reset rate rather than creating a fake ETA.
        samplesRef.current=[...samples.filter(x=>now-x.time<=60000 && x.height<=p.scannedHeight),
          {height:p.scannedHeight,time:now}].slice(-120);
        setLastAdvanceAt(now);
        setSyncRateValue(syncRate(samplesRef.current));
      } else if(p.scannedHeight<last.height){
        samplesRef.current=[{height:p.scannedHeight,time:now}];
        setLastAdvanceAt(now);
        setSyncRateValue(null);
      }
    };

    // FEELCOIN_SYNC_V4_FAST_REFRESH
    // Routine polling MUST NOT reset verified state or disable Send when the
    // tip is unchanged. Only an actual scan/verification revokes readiness.
    const synchronize=async(forceVerify=false,manual=false)=>{
      if(scanning || !ready || !isCurrent() || !walletRef.current || !window.FeelcoinScanner)return;
      scanning=true;
      if(manual)setRefreshing(true);
      // The last completed scan is authoritative. Avoid transient UI flicker
      // while performing a fast, nonblocking network check.
      if(!scanRef.current?.verified){
        setSyncPhase("connecting");
        setSyncStatus("Checking latest blockchain height…");
      }
      setNextRetryAt(null);
      try {
        const result=await window.FeelcoinScanner.scanWallet({
          core:coreRef.current,wallet:walletRef.current,previousResult:scanRef.current,
          forceVerify,
          onPhase:phase=>{
            if(!isCurrent())return;
            setFreshSync(false);
            setSyncPhase("scanning");
            setSyncStatus(phase==="verifying"?"Verifying wallet outputs…":"Scanning new blocks…");
            setLastAdvanceAt(Date.now());
          },
          onProgress:onScanProgress,
          onCheckpoint:checkpoint=>{
            if(!isCurrent())return;
            scanRef.current=checkpoint;
            // On the tip, the authoritative FINAL result is saved below.
            // Avoid a second large partial-state write/read before finalizing.
            if(checkpoint.scannedHeight===checkpoint.chainHeight)return;
            void saveScanCheckpoint(opened.address,checkpoint).then(saved=>{
              if(isCurrent() && !saved)setCheckpointState("failed");
            });
          }
        });
        if(isCurrent()){
          if(!Number.isSafeInteger(result.chainHeight) || result.chainHeight<=0 ||
            !Number.isSafeInteger(result.scannedHeight) || result.scannedHeight<opened.restoreHeight){
            throw new Error("INVALID_SCAN_HEIGHT");
          }
          scanRef.current=result;
          const wasSaved=result.fastPath===true && durableVerified;
          // A confirmed unchanged chain does not require re-writing the
          // same large checkpoint to IndexedDB every thirty seconds.
          let saved=wasSaved;
          if(!wasSaved){
            const written=await saveScanCheckpoint(opened.address,result);
            const verified=written?await loadScanCheckpoint<ScanResult>(opened.address):null;
            if(!isCurrent())return;
            saved=!!verified && verified.scannedHeight===result.scannedHeight &&
              verified.lastBlockHash===result.lastBlockHash &&
              verified.restoreHeight===opened.restoreHeight && verified.verified===true;
          }
          durableVerified=saved;
          setCheckpointState(saved?"saved":"failed");
          setLastSavedHeight(saved?result.scannedHeight:null);
          setScan(result);
          setProgress({scannedHeight:result.scannedHeight,chainHeight:result.chainHeight,ownedOutputs:result.ownedOutputs?.length??0});
          const complete=result.verified===true && result.scannedHeight>=result.chainHeight;
          setFreshSync(complete);
          setSyncPhase(complete?"synced":"scanning");
          setSyncStatus(complete?(saved?"Synchronized · checkpoint saved":"Synchronized · checkpoint NOT saved"):
            "Scanning blockchain…");
          if(result.timings){
            const t=result.timings;
            setLastCheck(result.fastPath?`No new blocks · network check ${(t.totalMs/1000).toFixed(1)}s`:
              `Network ${(t.heightMs/1000).toFixed(1)}s · scan ${(t.blocksMs/1000).toFixed(1)}s · verification ${(t.verificationMs/1000).toFixed(1)}s`+
              (t.spentStatusMs===undefined?"":` (spent outputs ${(t.spentStatusMs/1000).toFixed(1)}s / ${t.spentBatches??0} batches; coinbase ${(Number(t.coinbaseMs??0)/1000).toFixed(1)}s)`));
          }
          setLastAdvanceAt(Date.now());
          setNextRetryAt(null);
          setPending(readPending(opened.address));
        }
      }catch{
        if(isCurrent()){
          setFreshSync(false);
          setSyncPhase("error");
          setSyncStatus("Could not refresh wallet. Check connection and retry.");
          setNextRetryAt(Date.now()+30000);
        }
      }finally{
        scanning=false;
        if(isCurrent() && manual)setRefreshing(false);
        if(isCurrent() && forcePending){
          forcePending=false;
          void synchronize(true,false);
        }
      }
    };
    refreshRef.current=(force=false)=>{
      if(!isCurrent())return;
      if(scanning){
        if(force){forcePending=true;return;}
        setSyncStatus("Wallet scan is already running.");return;
      }
      if(!ready){setSyncStatus("Scanner is not ready. Reopen wallet if this persists.");return;}
      void synchronize(force,true);
    };
    void initialize().then(ok=>{if(ok && isCurrent())void synchronize(false,false);});
    // Lightweight chain-tip check every 30 seconds. On unchanged tip, the
    // scanner returns immediately without its expensive verification phase.
    const interval=window.setInterval(()=>{if(isCurrent() && ready && !scanning)void synchronize(false,false);},30000);
    return()=>{active=false;ready=false;refreshRef.current=()=>{};window.clearInterval(interval);++runId.current;};
  },[opened]);

  async function transfer(){
    if(sendingRef.current)return;
    if(!canSend){setMessage("Enter a valid recipient address and positive FEEL amount within your unlocked balance.");return;}
    if(!freshSync||syncPhase!=="synced"||!scanRef.current||!scanRef.current.verified||scanRef.current.chainHeight<=0||scanRef.current.scannedHeight<scanRef.current.chainHeight){setMessage("Wait for a freshly verified synchronization before sending.");return;}
    if(!/^\d+(?:\.\d{1,12})?$/.test(sendAmount)||!sendAddress.trim()){setMessage("Enter a valid recipient address and FEEL amount.");return;}
    if(!window.FeelcoinSend){setMessage("Transaction signer is not ready.");return;}
    sendingRef.current=true;
    setSending(true);
    setSendStage("Checking live blockchain and outputs");
    setSendDiagnostics("");
    const transactionStartedAt=performance.now();
    setMessage("Checking live blockchain and spend status before signing…");
    try {
      // FEELCOIN_SEND_PRECHECK_V3: Verify only the *selected* inputs against
      // the live daemon, after the user confirms and immediately before local
      // signing. This avoids repeated spent-status requests for every unlocked
      // output in a large wallet. Never skip the live tip and spent checks.
      const current=scanRef.current;
      if(!current || !current.verified || current.chainHeight<=0 ||
          current.scannedHeight<current.chainHeight ||
          !/^[0-9a-f]{64}$/i.test(current.lastBlockHash||"")){
        throw new Error("Wallet must be fully verified before spending.");
      }
      const validateSelectedInputs=async({usingOuts}:{usingOuts:SignInput[]})=>{
        const keyImages=selectedKeyImages(current.unlockedOutputs||[],usingOuts);
        // Exactly one spent-status request for a typical single-input send.
        // All requests are bounded to 3 concurrent batches of 100 inputs.
        const batches:string[][]=[];
        for(let offset=0;offset<keyImages.length;offset+=100)
          batches.push(keyImages.slice(offset,offset+100));
        let batchIndex=0;
        const verifyBatch=async()=>{
          while(batchIndex<batches.length){
            const keys=batches[batchIndex++];
            const response=await invoke<{spent_status?:number[]}>("mobile_chain_request",
              {path:"/api/chain/key-images-spent",method:"POST",body:{key_images:keys}});
            if(!Array.isArray(response.spent_status)||response.spent_status.length!==keys.length||
                response.spent_status.some(status=>status!==0)){
              throw new Error("Selected wallet input is spent or unverifiable. Refresh before sending.");
            }
          }
        };
        // Independent live network validations run concurrently. Never use
        // a stale cached 'unspent' flag as a substitute for daemon validation.
        const healthRequest=invoke<{height?:number;synchronized?:boolean}>("mobile_chain_request",
          {path:"/api/health",method:"GET",body:null});
        const tipRequest=invoke<{blocks?:Array<{block_header?:{hash?:string}}> }>("mobile_chain_request",
          {path:`/api/chain/blocks?start=${current.chainHeight-1}&count=1`,method:"GET",body:null});
        const spentRequests=Promise.all(Array.from({length:Math.min(3,batches.length)},()=>verifyBatch()));
        const [health,tip]=await Promise.all([healthRequest,tipRequest,spentRequests]);
        if(health?.synchronized===false || !Number.isSafeInteger(health?.height) ||
            health.height!==current.chainHeight ||
            tip?.blocks?.[0]?.block_header?.hash!==current.lastBlockHash){
          throw new Error("Blockchain height or tip changed. Synchronize before sending.");
        }
        const latest=scanRef.current;
        if(!latest?.verified || !freshSync || walletRef.current?.address!==opened?.address ||
            latest.chainHeight!==current.chainHeight || latest.lastBlockHash!==current.lastBlockHash ||
            latest.scannedHeight<latest.chainHeight){
          throw new Error("Wallet state changed while preparing transaction. Refresh before sending.");
        }
      };
      const preflightMs=performance.now()-transactionStartedAt;
      setSendStage("Preparing transaction");
      const stageSummary:string[]=[`Pre-send checks ${(preflightMs/1000).toFixed(1)}s`];
      const result=await window.FeelcoinSend.sendFeel({validateSelectedInputs,onStage:event=>{
        setSendStage(event.phase);
        if(event.previousPhase!==null){
          stageSummary.push(`${event.previousPhase} ${(event.previousStageMs/1000).toFixed(1)}s`);
          setSendDiagnostics(stageSummary.join(" · "));
        }
      }});
      if(result?.broadcasted===true){
        setSendSucceeded(true);
        const hash=result.tx_hash||"";
        if(/^[0-9a-f]{64}$/i.test(hash) && opened){
          const item:PendingTx={txid:hash.toLowerCase(),amount:atomicFromFeel(sendAmount),submittedAt:Date.now()};
          const updated=[...readPending(opened.address).filter(p=>p.txid!==item.txid),item];
          writePending(opened.address,updated);setPending(updated);
        }
        setMessage("Transaction submitted to the Feelcoin network. Hash: "+(hash||"not returned by signer"));
        setSendAddress("");setSendAmount("");
        // Preserve previous balance/history until a fresh scan is complete.
        setFreshSync(false);
        setSyncPhase("connecting");
        setSyncStatus("Refreshing after transfer…");
        // Mempool status can change without any new block. Never take the
        // unchanged-tip shortcut immediately after a broadcast.
        refreshRef.current(true);
      }
    }catch(error){setMessage("Transfer could not be confirmed. Check history before retrying: "+String(error));}
    finally{
      sendingRef.current=false;
      setSending(false);
      setSendStage("");
    }
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
    sendingRef.current=false;setSendStage("");setSendDiagnostics("");
    setSendSucceeded(false);setSendAddress("");setSendAmount("");
    walletRef.current=null;scanRef.current=null;setScan(null);setProgress(null);setPending([]);setSyncStatus("Not synchronized");setSyncPhase("idle");setFreshSync(false);setCheckpointState("checking");setLastSavedHeight(null);setSyncRateValue(null);setNextRetryAt(null);setLastAdvanceAt(null);samplesRef.current=[];setOpened(null);
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
        // Sample two live official heights BEFORE generating new wallet keys.
        // This shortcut never applies to recovered wallets or existing vaults.
        const creationStart = mode === "create" ? await safeNewWalletStart() : 0;
        const wallet = mode === "create"
          ? await generateWallet()
          : await recoverWallet(mnemonic, Number(height));
        if (mode === "create") wallet.restoreHeight = creationStart;
        await saveWallet(cleanName, password, wallet);
        setKnownWallets(walletNames());
        // FEELCOIN_AUTO_OPEN_NEW_WALLET_V2: keep already-decrypted keys in RAM
        // until seed backup confirmed. Password still required on later unlock.
        walletRef.current=wallet;
        if (mode === "create") {
          setBackupWords(wallet.mnemonic);
          setBackedUp(false);
        } else {
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

  const syncReady=freshSync && syncPhase==="synced" && !!scan && scan.chainHeight>0 && scan.scannedHeight>=scan.chainHeight;
  // This is only a cheap frontend gate. The local signer still performs
  // authoritative network-specific address and fee validation.
  const validRecipient=/^[1-9A-HJ-NP-Za-km-z]{90,110}$/.test(sendAddress.trim());
  let sendAtomic:bigint|null=null;
  try{if(/^\d+(?:\.\d{1,12})?$/.test(sendAmount.trim()))sendAtomic=BigInt(atomicFromFeel(sendAmount.trim()));}catch{}
  const validAmount=sendAtomic!==null && sendAtomic>0n &&
    typeof scan?.unlockedBalance==="bigint" && sendAtomic<=scan.unlockedBalance;
  const canSend=!sending && !sendSucceeded && syncReady && typeof scan?.balance==="bigint" && validRecipient && validAmount;
  const percent=progress?syncPercent(progress.scannedHeight,progress.chainHeight,opened?.restoreHeight??0):null;
  const remaining=progress?syncRemaining(progress.scannedHeight,progress.chainHeight):null;
  const stalled=(syncPhase==="scanning"||syncPhase==="connecting") && !syncReady && lastAdvanceAt!==null && syncClock-lastAdvanceAt>=90000;
  const eta=(!stalled && syncPhase==="scanning" && remaining!==null && remaining>0)?syncEta(remaining,syncRateValue):null;
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
      {(pullDistance>8 || pullRefreshing)&&<div className="fm-ptr-indicator" role="status" aria-live="polite">
        <span className={pullRefreshing?"fm-ptr-spinner":"fm-ptr-arrow"} aria-hidden="true">{pullRefreshing?"":"↓"}</span>
        {pullRefreshing?"Checking Feelcoin network…":pullDistance>=65?"Release to refresh":"Pull down to refresh"}
      </div>}
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
        <div><span>Sync status</span><b>{stalled?"Scan has not advanced for 90 seconds":syncStatus}</b></div>
        <div><span>Saved scan height</span><b>{lastSavedHeight===null?"—":lastSavedHeight.toLocaleString()}</b></div>
        {lastCheck&&<div><span>Last chain check</span><b>{lastCheck}</b></div>}
        <div><span>Current balance</span><b>{amountText(scan?.balance)} FEEL</b></div>
        <div><span>Unlocked balance</span><b>{amountText(scan?.unlockedBalance)} FEEL</b></div>
      </section>
      <section className="fm-card fm-sync-card" aria-label="Wallet synchronization">
        <div className="fm-sync-heading"><strong>Wallet synchronization</strong><span className={syncReady?"fm-sync-badge good":"fm-sync-badge"}>{syncReady?"Verified":syncPhase==="error"?"Interrupted":stalled?"Not progressing":"In progress"}</span></div>
        <div className="fm-sync-percent">{percent!==null?`${percent.toFixed(1)}%`:"—"}<small>{syncReady?"Up to date":syncPhase==="error"?"Connection or scanner error":remaining===0?"Finishing verification":stalled?"Waiting for scanner":"Blockchain scan"}</small></div>
        <div className="fm-sync-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent===null?undefined:percent} aria-label="Wallet scan progress"><div style={{width:`${percent??0}%`}} /></div>
        <div className="fm-sync-stats">
          <div><span>Scanned block</span><strong>{progress?.scannedHeight.toLocaleString()??"—"}</strong></div>
          <div><span>Network height</span><strong>{progress?.chainHeight.toLocaleString()??"—"}</strong></div>
          <div><span>Remaining blocks</span><strong>{remaining?.toLocaleString()??"—"}</strong></div>
          <div><span>Estimated time</span><strong>{syncReady?"Complete":syncPhase==="error"?"Unavailable":remaining===0?"Finalizing verification…":stalled?"Scan stalled":eta!==null?formatSyncEta(eta):"Calculating…"}</strong></div>
        </div>
        <p className="fm-sync-note" role="status">{syncReady?"Wallet scan completed against a live blockchain height.":syncPhase==="error"?"Your last known balance may be outdated. Automatic retry occurs approximately every 30 seconds; you can also retry now.":stalled?"Scanner has not reported new progress. A request may still be running; no second scanner will start until it finishes.":"Balance and transaction history may be incomplete until synchronization finishes."}</p>
        {syncPhase==="error"&&nextRetryAt!==null&&<p className="fm-sync-meta">Next automatic retry in about {Math.max(0,Math.ceil((nextRetryAt-syncClock)/1000))}s</p>}
        {checkpointState==="failed"&&<p role="alert" className="fm-sync-note">Warning: wallet scan progress could not be saved. Keep the app open and back up your recovery seed offline; closing may require a rescan. Your wallet keys are unchanged.</p>}
        <button type="button" className="fm-outline-button fm-sync-retry" disabled={refreshing} onClick={()=>refreshRef.current()}>{refreshing?"Checking blockchain…":syncPhase==="error"?"Retry synchronization":"Check now"}</button>
      </section>
      <div className="fm-wallet-modes">{(["receive","send","history"] as const).map(t=><button key={t} type="button" className={walletTab===t?"active":""} onClick={()=>setWalletTab(t)}>{t.toUpperCase()}</button>)}<button type="button" className="fm-refresh-tab" disabled={refreshing} onClick={()=>refreshRef.current()}>{refreshing?"Refreshing…":"↻ REFRESH"}</button></div>
      {walletTab==="receive"&&<section className="fm-card fm-receive-x"><h2>Receive FEEL</h2><p>Show this code to receive FEEL directly into your wallet.</p>{qrImage?<img className="fm-receive-qr" src={qrImage} alt="QR code containing only your public receiving address" />:<p>Preparing receiving QR code…</p>}<p className="fm-address fm-wrap">{opened.address}</p><button type="button" className="fm-outline-button" onClick={()=>void navigator.clipboard.writeText(opened.address).then(()=>setMessage("Receiving address copied.")).catch(()=>setMessage("Clipboard unavailable."))}>Copy address</button><p>Confirm incoming funds only after wallet synchronization.</p></section>}
      {walletTab==="history"&&<section className="fm-card fm-history"><strong>Transaction history</strong>{historyRows.length?historyRows.map((item,i)=><div key={`${item.txid}-${item.type}-${i}`} className="fm-history-item"><div className="fm-history-head"><strong>{item.type==="out"?"↗ SENT":item.type==="in"?"↙ RECEIVED":"TRANSACTION"}</strong><span>{item.pending?"Pending · submitted":item.height!==undefined?`Block ${item.height}`:"Unconfirmed"}</span></div><div className="fm-history-amount">{item.type==="out"?"−":item.type==="in"?"+":""}{amountText(item.amount)} FEEL</div><div className="fm-history-hash">{item.txid||"—"}</div></div>):<p>{scan?"No wallet transactions detected.":"Synchronize the wallet to see transactions."}</p>}<p className="fm-history-note">Pending means locally recorded after network submission; it does not guarantee confirmation. History updates when the blockchain scanner detects a transaction.</p></section>}
      {walletTab==="send"&&<section className="fm-card"><h2>Send FEEL</h2><div className="fm-wallet-send-fields"><label htmlFor="sendAddress">Recipient address</label><textarea id="sendAddress" rows={3} value={sendAddress} onChange={e=>{setSendSucceeded(false);setSendAddress(e.target.value);}} autoComplete="off" spellCheck={false}/><div className="fm-scan-actions"><button type="button" className="fm-outline-button" disabled={qrBusy} onClick={()=>void scanCamera()}>◎ {qrBusy?"Scanning…":"Scan QR"}</button><button type="button" className="fm-outline-button" disabled={qrBusy} onClick={()=>qrFile.current?.click()}>▧ From gallery</button></div><input ref={qrFile} className="fm-hidden-file" type="file" accept="image/*" aria-label="Choose QR image from gallery" onChange={e=>void scanGallery(e.target.files?.[0])}/><label htmlFor="sendAmount">Amount (FEEL)</label><input id="sendAmount" value={sendAmount} onChange={e=>{setSendSucceeded(false);setSendAmount(e.target.value);}} inputMode="decimal"/></div><p>LIVE TRANSFER: Verify recipient, amount and network fee before confirming. The signed transaction will be broadcast to the network.</p><button type="button" className="fm-gold-button" disabled={!canSend} onClick={()=>void transfer()}>{sending?(sendStage||"Preparing transaction…"):sendSucceeded?"✓ Transaction sent":"Review and send FEEL"}</button>{sendDiagnostics&&<p className="fm-sync-meta" role="status">Transaction timings: {sendDiagnostics}</p>}<p id="sendMessage" role="status"/></section>}
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
          const created=walletRef.current;
          if(!created || !name.trim()) {
            reset("open");
            setMessage("Creation session expired; open the encrypted wallet with your password.");
            return;
          }
          setBackupWords(""); setBackedUp(false);
          setPassword(""); setConfirmPassword("");
          setWalletTab("receive");
          setOpened({name:name.trim(), address:created.address, restoreHeight:created.restoreHeight});
          setMessage(created.restoreHeight>0
            ? "Wallet opened. Fast synchronization starts from a recent verified height."
            : "Wallet opened. Network height unavailable; safely scanning from genesis.");
        }}>I saved my seed — open wallet</button>
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
