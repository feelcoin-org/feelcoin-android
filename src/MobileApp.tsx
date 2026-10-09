import {useCallback,useEffect,useState,type FormEvent} from "react";
import {invoke} from "@tauri-apps/api/core";
import "./mobile.css";
import MobileWallet from "./MobileWallet";
type Tab="wallet"|"mining"|"explorer"|"network"|"settings";
type Stats={pool_hashrate?:number;network_hashrate?:number;network_height?:number;connected_miners?:number;pool_fee?:number;miner_hashrate?:number;miner_balance?:number;miner_total_paid?:number;worker_count?:number};
type Worker={name?:string;worker?:string;id?:string;hashrate?:number;hash_rate?:number;last_share?:number;last_seen?:number};
type Payment={amount?:number;timestamp?:number;time?:number;txid?:string;tx_hash?:string;hash?:string};
type BlockHeader={height?:number;hash?:string;prev_hash?:string;timestamp?:number;difficulty?:number;reward?:number;num_txes?:number;block_size?:number;block_weight?:number;nonce?:number;major_version?:number};
type ExplorerHome={info?:{height?:number;difficulty?:number;target?:number;tx_count?:number;tx_pool_size?:number;incoming_connections_count?:number;outgoing_connections_count?:number;synchronized?:boolean;nettype?:string};supply?:{emitted_supply?:string};blocks?:BlockHeader[];server_time?:number};
type NodeInfo={name?:string;host?:string;online?:boolean;height?:number;incoming?:number;outgoing?:number;synchronized?:boolean;state?:string;p2p_port?:number};
type NetworkStatus={updated_at?:string;network?:{height?:number;difficulty?:number;target_seconds?:number;synchronized?:boolean;name?:string};nodes?:Record<string,NodeInfo>};
type ChainSearch={type:"block-height"|"block-hash"|"transaction";query:string;data:{result?:{block_header?:BlockHeader;reward_breakdown?:{total?:number;miner?:number;treasury?:number;fees?:number|null};tx_hashes?:string[]};txs?:Array<{tx_hash?:string;in_pool?:boolean;block_height?:number;block_timestamp?:number;double_spend_seen?:boolean;prunable_hash?:string}>}};
const fmtNum=(value?:number|null)=>typeof value==="number"&&Number.isFinite(value)?value.toLocaleString("en-US"):"—";
const fmtTime=(timestamp?:number)=>typeof timestamp==="number"&&timestamp>0?new Date(timestamp*1000).toLocaleString():"—";
const STORAGE="feelcoin.android.mining.address.v1";
const walletURL="https://wallet.feelcoin.org";
const poolURL="https://pool.feelcoin.org";
const explorerURL="https://explorer.feelcoin.org";
function fmtHash(n?:number){if(!Number.isFinite(n))return "—";const v=n as number;const x=v>=1e9?[1e9,"GH/s"]:v>=1e6?[1e6,"MH/s"]:v>=1e3?[1e3,"KH/s"]:[1,"H/s"];return (v/(x[0] as number)).toLocaleString("en-US",{maximumFractionDigits:2})+" "+x[1];}
function fmtFeel(n?:number){return Number.isFinite(n)?(n as number).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:8})+" FEEL":"—";}
function fmtAtomic(n?:number){if(typeof n!=="number"||!Number.isSafeInteger(n)||n<0)return "—";const v=BigInt(n);const whole=(v/1000000000000n).toString();const fraction=(v%1000000000000n).toString().padStart(12,"0").replace(/0+$/,"");return whole+(fraction?"."+fraction:"")+" FEEL";}
function ago(t?:number){if(!t)return "Unknown";const ms=t>1e12?t:t*1000;const d=Math.max(0,Date.now()-ms);return d<6e4?"Just now":d<36e5?Math.floor(d/6e4)+"m ago":d<864e5?Math.floor(d/36e5)+"h ago":Math.floor(d/864e5)+"d ago";}
const isPublicAddress=(a:string)=>a.length>=90&&a.length<=110&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(a);
const ICONS:Record<Tab,string>={wallet:"◈",mining:"⛏",explorer:"▤",network:"◎",settings:"⚙"};
// FEELCOIN_ANDROID_THEME_V1 — system default, user override saved locally.
type FeelTheme = "system" | "dark" | "light";
const THEME_KEY = "feelcoin.android.appearance.v1";
function readTheme(): FeelTheme {
 try { const value = localStorage.getItem(THEME_KEY); return value === "dark" || value === "light" || value === "system" ? value : "dark"; }
 catch { return "system"; }
}
export default function MobileApp(){
 const [tab,setTab]=useState<Tab>("wallet");
 const [theme,setTheme]=useState<FeelTheme>(readTheme);
 useEffect(()=>{
  const el=document.documentElement;
  el.setAttribute("data-feel-theme",theme);
  el.style.colorScheme=theme==="system"?"light dark":theme;
  try {localStorage.setItem(THEME_KEY,theme);}catch{}
  return()=>{el.removeAttribute("data-feel-theme");el.style.removeProperty("color-scheme");};
 },[theme]);
 const [address,setAddress]=useState(()=>localStorage.getItem(STORAGE)||"");
 const [draft,setDraft]=useState(address);
 const [editing,setEditing]=useState(!address);
 const [auto,setAuto]=useState(true);
 const [stats,setStats]=useState<Stats|null>(null);
 const [workers,setWorkers]=useState<Worker[]>([]);
 const [payments,setPayments]=useState<Payment[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [updated,setUpdated]=useState<number|null>(null);
 const [chain,setChain]=useState<ExplorerHome|null>(null);
  const [networkChecking,setNetworkChecking]=useState(true);
 const [nodes,setNodes]=useState<NetworkStatus|null>(null);
 const [chainLoading,setChainLoading]=useState(false);
 const [chainError,setChainError]=useState("");
 const [chainUpdated,setChainUpdated]=useState<number|null>(null);
 const [searchQuery,setSearchQuery]=useState("");
 const [searchResult,setSearchResult]=useState<ChainSearch|null>(null);
 const [searchError,setSearchError]=useState("");
 const [searching,setSearching]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const a=isPublicAddress(address)?address:null;
   const out=await Promise.allSettled([
    invoke<Stats>("mobile_pool_stats",{walletAddress:a}),
    a?invoke<Worker[]>("mobile_pool_workers",{walletAddress:a}):Promise.resolve([]),
    a?invoke<Payment[]>("mobile_pool_payments",{walletAddress:a}):Promise.resolve([])
   ]);
   if(out[0].status==="fulfilled"){setStats(out[0].value);setUpdated(Date.now());}else{setStats(null);setError("Could not reach official Feelcoin Pool. Please try again.");}
   if(out[1].status==="fulfilled"&&Array.isArray(out[1].value)){
    const raw=out[1].value as unknown[];
    // Pool /workers reports an alternating [rig_name, hashrate, ...] array.
    const mapped:Worker[]=raw.length&&typeof raw[0]==="string"?Array.from({length:Math.floor(raw.length/2)},(_,i)=>({name:String(raw[i*2]),hashrate:Number(raw[i*2+1])})):raw as Worker[];
    setWorkers(mapped);
   }else setWorkers([]);
   setPayments(out[2].status==="fulfilled"&&Array.isArray(out[2].value)?out[2].value:[]);
  }finally{setLoading(false);}
 },[address]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(!auto)return;const t=window.setInterval(()=>void refresh(),30000);return()=>clearInterval(t);},[refresh,auto]);
 const refreshChain=useCallback(async()=>{
  setChainLoading(true);setNetworkChecking(true);setChainError("");
  try{
   const results=await Promise.allSettled([
    invoke<ExplorerHome>("mobile_explorer_home"),
    invoke<NetworkStatus>("mobile_network_status")
   ]);
   if(results[0].status==="fulfilled"){const home = results[0].value;
    setChain(
      typeof home?.info?.height === "number" &&
      home.info.height > 0 ? home : null
    );
    setChainUpdated(Date.now());}
   else{setChain(null);setChainError("Live explorer information is temporarily unavailable.");}
   if(results[1].status==="fulfilled"){setNodes(results[1].value);}
   else{setNodes(null);if(results[0].status==="fulfilled")setChainError("Node status is temporarily unavailable.");}
  }finally{setChainLoading(false);setNetworkChecking(false);}
 },[]);
 useEffect(()=>{void refreshChain();},[refreshChain]);
 useEffect(()=>{
  if(!auto)return;
  const timer=window.setInterval(()=>void refreshChain(),30000);
  return()=>window.clearInterval(timer);
 },[auto,tab,refreshChain]);
 async function searchChain(query:string){
  const q=query.trim();
  if(!(/^[0-9]{1,12}$/.test(q)||/^[0-9a-fA-F]{64}$/.test(q))){
   setSearchError("Enter a numeric block height or 64-character transaction/block hash.");
   setSearchResult(null);return;
  }
  setSearchError("");setSearching(true);setSearchResult(null);
  try{
   const result=await invoke<ChainSearch>("mobile_explorer_search",{query:q});
   setSearchResult(result);
  }catch(err){setSearchError(String(err));}
  finally{setSearching(false);}
 }
 function save(){const a=draft.trim();if(a&&!isPublicAddress(a)){setError("Invalid public FEEL address format.");return;}if(a)localStorage.setItem(STORAGE,a);else localStorage.removeItem(STORAGE);setAddress(a);setEditing(false);setError("");}
 function open(url:string){void invoke("mobile_open_link",{url}).catch(()=>setError("Could not open this link."));}
 const hasMiner=!!address&&!!stats;
 return <div className="fm">
  <header className="fm-header"><div className="fm-brand"><img alt="Official Feelcoin logo" src="/feelcoin-logo.png"/><div><b>FEELCOIN</b><small>ANDROID BETA</small></div></div><span className="fm-pill" title="Official Feelcoin blockchain connectivity. Wallet synchronization is separate."><i style={{background:chain?"#69d6a1":"#e7aa62"}}/>{networkChecking && !chainUpdated ? "CONNECTING..." : chain ? "NETWORK CONNECTED" : "NETWORK DISCONNECTED"}</span></header>
  <main className="fm-main">
   {tab==="mining"&&<>
    <p className="fm-kicker">POOL NETWORK • REMOTE WORKERS</p><h1>Pool <em>Stats.</em></h1><p className="fm-lead">Monitor your mining rigs remotely. No mining runs on your phone.</p>
    <div className="fm-grid fm-pool-summary"><section className="fm-card"><small>POOL HASHRATE</small><strong>{fmtHash(stats?.pool_hashrate)}</strong><span>Combined pool mining power</span></section><section className="fm-card"><small>NETWORK HASHRATE</small><strong>{fmtHash(stats?.network_hashrate)}</strong><span>Feelcoin network</span></section><section className="fm-card"><small>BLOCKCHAIN HEIGHT</small><strong>{fmtNum(stats?.network_height)}</strong><span>Pool-reported chain height</span></section><section className="fm-card"><small>CONNECTED MINERS</small><strong>{fmtNum(stats?.connected_miners)}</strong><span>Active pool miners</span></section></div>
    <section className="fm-card"><div className="fm-row"><div><small>TRACKED PUBLIC ADDRESS</small><strong className="fm-address">{address?address.slice(0,10)+"…"+address.slice(-7):"Not linked"}</strong></div><button className="fm-small" onClick={()=>{setDraft(address);setEditing(x=>!x);}}>Edit</button></div>{editing&&<div className="fm-edit"><label htmlFor="fm-address">Public FEEL receiving address</label><textarea id="fm-address" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Paste the address used by your miners" spellCheck={false}/><button className="fm-gold-button" onClick={save}>Save address</button><p>We only need your public mining address. Never enter a seed or private key.</p></div>}</section>
    <section className="fm-feature"><div className="fm-row"><small>YOUR CURRENT HASHRATE</small><span className="fm-green">● {loading && !updated ? "CHECKING..." : stats ? "POOL CONNECTED" : "POOL DISCONNECTED"}</span></div><div className="fm-big">{fmtHash(hasMiner?stats?.miner_hashrate:undefined)}</div><div className="fm-row fm-foot"><span>Read-only pool data</span><span>{updated?"Updated "+ago(updated):"Not updated"}</span></div></section>
    <div className="fm-grid"><section className="fm-card"><small>UNPAID POOL BALANCE</small><strong>{fmtFeel(hasMiner?stats?.miner_balance:undefined)}</strong><span>Not wallet balance</span></section><section className="fm-card"><small>REPORTED WORKERS</small><strong>{hasMiner?(stats?.worker_count??workers.length):"—"}</strong><span>Pool worker count</span></section><section className="fm-card"><small>POOL PAID TOTAL</small><strong>{fmtFeel(hasMiner?stats?.miner_total_paid:undefined)}</strong><span>Historical payouts</span></section><section className="fm-card"><small>POOL FEE</small><strong>{stats?.pool_fee===undefined?"—":(stats.pool_fee*100).toFixed(2)+"%"}</strong><span>Current pool setting</span></section></div>
    <div className="fm-heading"><h2>Your mining workers</h2><span>{workers.length} listed</span></div><section className="fm-card fm-list">{workers.length?workers.slice(0,20).map((w,i)=><div className="fm-worker" key={i}><div className="fm-worker-mark">▣</div><div className="fm-expand"><b>{w.name||w.worker||w.id||"Worker "+(i+1)}</b><small>Last share: {ago(w.last_share??w.last_seen)}</small></div><b className="fm-gold">{fmtHash(w.hashrate??w.hash_rate)}</b></div>):<div className="fm-empty">No worker information yet. Enter the same FEEL public address used by your miners.</div>}</section>
    <div className="fm-heading"><h2>Mining payouts</h2><span>{payments.length} recent</span></div><section className="fm-card fm-list">{address?payments.length?payments.slice(0,25).map((p,i)=><div className="fm-worker" key={i}><div className="fm-worker-mark">↗</div><div className="fm-expand"><b>{fmtAtomic(p.amount)}</b><small>{ago(p.timestamp??p.time)}</small></div></div>):<div className="fm-empty">No recent payouts reported for this address.</div>:<div className="fm-empty">Add your public mining address first.</div>}</section>
    <div className="fm-heading"><h2>Network snapshot</h2><span>Official pool</span></div><section className="fm-card fm-network"><div><span>Pool hashrate</span><b>{fmtHash(stats?.pool_hashrate)}</b></div><div><span>Network hashrate</span><b>{fmtHash(stats?.network_hashrate)}</b></div><div><span>Block height</span><b>{stats?.network_height?.toLocaleString()??"—"}</b></div><div><span>Connected miners</span><b>{stats?.connected_miners?.toLocaleString()??"—"}</b></div></section>
    <button className="fm-outline-button" disabled={loading} onClick={()=>void refresh()}>{loading?"Refreshing…":"↻ Refresh miner statistics"}</button><button className="fm-link" onClick={()=>open(poolURL)}>Official mining pool ↗</button>
   </>}
   <div className="fm-wallet-persistent" style={{display:tab==="wallet"?"block":"none"}}><MobileWallet/></div>
   {tab==="explorer"&&<>
    <p className="fm-kicker">THE FEELCOIN BLOCKCHAIN</p><h1>Block <em>Explorer.</em></h1>
    <p className="fm-lead">Look up blocks and transactions here, with live information from the official Feelcoin explorer.</p>
    <form className="fm-search" onSubmit={(event:FormEvent)=>{event.preventDefault();void searchChain(searchQuery);}}>
     <label htmlFor="fm-chain-search">Block height, block hash or transaction ID</label>
     <input id="fm-chain-search" value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder="Enter height or 64-character hash" spellCheck={false} autoCapitalize="none" autoComplete="off"/>
     <button type="submit" className="fm-gold-button" disabled={searching}>{searching?"Searching…":"Search blockchain"}</button>
    </form>
    {searchError&&<p className="fm-error" role="alert">{searchError}</p>}
    {searchResult&&<section className="fm-card"><div className="fm-heading"><h2>{searchResult.type==="transaction"?"Transaction details":"Block details"}</h2><button className="fm-small" onClick={()=>{setSearchResult(null);setSearchError("");}}>Clear</button></div>
     {searchResult.type==="transaction"?(()=>{
      const tx=searchResult.data?.txs?.[0];return <div className="fm-network fm-details">
       <div><span>Transaction hash</span><b className="fm-hash">{tx?.tx_hash??searchResult.query}</b></div>
       <div><span>Block height</span><b>{fmtNum(tx?.block_height)}</b></div>
       <div><span>Status</span><b>{tx?.in_pool?"Pending / mempool":tx?.block_height!=null?"Confirmed":"Unavailable"}</b></div>
       <div><span>Block timestamp</span><b>{fmtTime(tx?.block_timestamp)}</b></div>
       <div><span>Double-spend seen</span><b>{tx?.double_spend_seen===undefined?"—":tx.double_spend_seen?"Yes":"No"}</b></div>
       <div><span>Prunable hash</span><b className="fm-hash">{tx?.prunable_hash??"—"}</b></div>
      </div>;
     })():(()=>{
      const header=searchResult.data?.result?.block_header;
      const reward=searchResult.data?.result?.reward_breakdown;
      return <div className="fm-network fm-details">
       <div><span>Height</span><b>{fmtNum(header?.height)}</b></div>
       <div><span>Block hash</span><b className="fm-hash">{header?.hash??"—"}</b></div>
       <div><span>Previous hash</span><b className="fm-hash">{header?.prev_hash??"—"}</b></div>
       <div><span>Timestamp</span><b>{fmtTime(header?.timestamp)}</b></div>
       <div><span>Transactions</span><b>{fmtNum(header?.num_txes)}</b></div>
       <div><span>Difficulty</span><b>{fmtNum(header?.difficulty)}</b></div>
       <div><span>Total reward</span><b>{fmtAtomic(header?.reward)}</b></div>
       {reward?.miner!==undefined&&<div><span>Miner / pool</span><b>{fmtAtomic(reward.miner)}</b></div>}
       {reward?.treasury!==undefined&&<div><span>Development treasury</span><b>{fmtAtomic(reward.treasury)}</b></div>}
       <div><span>Block weight</span><b>{fmtNum(header?.block_weight)}</b></div>
       <div><span>Nonce</span><b>{fmtNum(header?.nonce)}</b></div>
      </div>;
     })()}
    </section>}
    <div className="fm-grid fm-chain-summary">
     <section className="fm-card"><small>BLOCK HEIGHT</small><strong>{fmtNum(chain?.info?.height??stats?.network_height)}</strong><span>Explorer-reported</span></section>
     <section className="fm-card"><small>DIFFICULTY</small><strong>{fmtNum(chain?.info?.difficulty)}</strong><span>Current network</span></section>
     <section className="fm-card"><small>MEMPOOL TX</small><strong>{fmtNum(chain?.info?.tx_pool_size)}</strong><span>Waiting to confirm</span></section>
     <section className="fm-card"><small>EMITTED SUPPLY</small><strong>{chain?.supply?.emitted_supply?Number(chain.supply.emitted_supply).toLocaleString("en-US",{maximumFractionDigits:3}):"—"}</strong><span>FEEL issued</span></section>
    </div>
    <div className="fm-heading"><h2>Latest blocks</h2><span>{chain?.blocks?.length??0} reported</span></div>
    <section className="fm-card fm-list">{chain?.blocks?.length?chain.blocks.slice(0,10).map((block,index)=>
     <button type="button" className="fm-block" key={block.hash??index} onClick={()=>{const height=String(block.height??"");setSearchQuery(height);void searchChain(height);}}>
      <span className="fm-expand"><b>Block #{fmtNum(block.height)}</b><small className="fm-hash">{block.hash??"Hash unavailable"}</small><small>{ago(block.timestamp)} · {fmtNum(block.num_txes)} transactions</small></span>
      <span className="fm-block-reward">{fmtAtomic(block.reward)}<small>{fmtNum(block.difficulty)} difficulty</small></span>
     </button>):<div className="fm-empty">{chainLoading?"Loading recent blocks…":"Recent blocks unavailable. Refresh to try again."}</div>}</section>
    {chainError&&<p className="fm-muted-error" role="status">{chainError}</p>}
    <button className="fm-outline-button" disabled={chainLoading} onClick={()=>void refreshChain()}>{chainLoading?"Refreshing…":"↻ Refresh explorer"}</button>
    <button className="fm-link" onClick={()=>open(explorerURL)}>Visit full explorer ↗</button>
   </>}
   {tab==="network"&&<>
    <p className="fm-kicker">LIVE BLOCKCHAIN STATUS</p><h1>Feelcoin <em>Network.</em></h1>
    <p className="fm-lead">Network data from the official explorer and mining pool. Node visibility is not the same as wallet synchronization.</p>
    <section className="fm-card"><b>Wallet connection</b><p>Wallet creation, recovery and transaction signing happen locally on your device. Balance synchronization connects to the official Feelcoin wallet API. Signed transactions can be submitted to the live Feelcoin network. No local daemon is required.</p></section>
    <section className="fm-card fm-network">
     <div><span>Network height</span><b>{fmtNum(chain?.info?.height??nodes?.network?.height??stats?.network_height)}</b></div>
     <div><span>Network hashrate</span><b>{fmtHash(stats?.network_hashrate??((chain?.info?.difficulty&&chain?.info?.target)?chain.info.difficulty/chain.info.target:undefined))}</b></div>
     <div><span>Difficulty</span><b>{fmtNum(chain?.info?.difficulty??nodes?.network?.difficulty)}</b></div>
     <div><span>Target block time</span><b>{nodes?.network?.target_seconds??chain?.info?.target??120}s</b></div>
     <div><span>Reported peers</span><b>{chain?.info?.incoming_connections_count!=null||chain?.info?.outgoing_connections_count!=null?fmtNum((chain?.info?.incoming_connections_count??0)+(chain?.info?.outgoing_connections_count??0)):"—"}</b></div>
     <div><span>Node sync reported</span><b>{nodes?.network?.synchronized===undefined?"—":nodes.network.synchronized?"Synced":"Syncing"}</b></div>
     <div><span>Transactions seen</span><b>{fmtNum(chain?.info?.tx_count)}</b></div>
     <div><span>Mempool transactions</span><b>{fmtNum(chain?.info?.tx_pool_size)}</b></div>
     <div><span>Emitted supply</span><b>{chain?.supply?.emitted_supply?Number(chain.supply.emitted_supply).toLocaleString("en-US",{maximumFractionDigits:4})+" FEEL":"—"}</b></div>
     <div><span>Pool hashrate</span><b>{fmtHash(stats?.pool_hashrate)}</b></div>
     <div><span>Connected pool miners</span><b>{fmtNum(stats?.connected_miners)}</b></div>
    </section>
    <div className="fm-heading"><h2>Official nodes</h2><span>Reported infrastructure</span></div>
    {nodes?.nodes&&Object.keys(nodes.nodes).length?Object.entries(nodes.nodes).map(([id,node])=>
     <section className="fm-card fm-node-card" key={id}>
      <div className="fm-row"><b>{node.name||id}</b><span className={node.online?"fm-node-online":"fm-node-offline"}>● {node.online?"Online":"Offline"}</span></div>
      <p className="fm-node-host">{node.host||"Host not reported"}{node.p2p_port?":"+node.p2p_port:""}</p>
      <div className="fm-network"><div><span>Reported height</span><b>{fmtNum(node.height)}</b></div>
       {node.incoming!=null&&<div><span>Incoming peers</span><b>{fmtNum(node.incoming)}</b></div>}
       {node.outgoing!=null&&<div><span>Outgoing peers</span><b>{fmtNum(node.outgoing)}</b></div>}
       <div><span>Sync status</span><b>{node.synchronized===undefined?(node.state??"—"):node.synchronized?"Synced":"Syncing"}</b></div>
      </div>
     </section>):<section className="fm-card"><p>{chainLoading?"Checking official nodes…":"Node status unavailable. No estimates are shown."}</p></section>}
    <p className="fm-lead">Node counts above describe known published nodes and their observed connections, not a verified count of all nodes worldwide. {chainUpdated?"Updated "+ago(chainUpdated)+".":""}</p>
    {chainError&&<p className="fm-muted-error" role="status">{chainError}</p>}
    <button className="fm-outline-button" disabled={chainLoading||loading} onClick={()=>{void refresh();void refreshChain();}}>{chainLoading||loading?"Refreshing…":"↻ Refresh network"}</button>
    <button className="fm-link" onClick={()=>open(explorerURL)}>Official explorer ↗</button>
   </>}
   {tab==="settings"&&<><p className="fm-kicker">YOUR APP</p><h1>App <em>Settings.</em></h1><section className="fm-card fm-appearance"><b>Appearance</b><p>Follow your phone theme, or choose a look for Feelcoin.</p><div className="fm-theme-controls" role="group" aria-label="Wallet appearance">{(["system","dark","light"] as FeelTheme[]).map(x=><button key={x} type="button" className={theme===x?"active":""} aria-pressed={theme===x} onClick={()=>setTheme(x)}>{x==="system"?"System default":x==="dark"?"Dark":"Light"}</button>)}</div></section><section className="fm-card fm-row"><div><b>Foreground auto-refresh</b><p>Update pool data every 30 seconds while the app is open.</p></div><input aria-label="Automatic refresh" type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/></section><section className="fm-card"><b>Saved monitoring address</b><p className="fm-address fm-wrap">{address||"None"}</p><button className="fm-outline-button" onClick={()=>{localStorage.removeItem(STORAGE);setAddress("");setDraft("");setEditing(true);setTab("mining");}}>Forget public address</button></section><section className="fm-card"><b>Android Beta — Wallet Security</b><p>Wallet creation, recovery, and transaction signing are performed locally on your device using the bundled FEEL wallet engine. Blockchain synchronization and live transaction broadcasting are supported through the official Feelcoin network services. This is beta software. Keep your recovery seed securely backed up and use small test transactions until reliability and security testing are complete.</p></section><button className="fm-link" onClick={()=>open("https://feelcoin.org")}>Visit official website ↗</button><button className="fm-link" onClick={()=>open("https://github.com/feelcoin-org/feelcoin-desktop")}>View source on GitHub ↗</button></>}
   {error&&<p className="fm-error" role="status">{error}</p>}
  </main><nav className="fm-tabs" aria-label="App navigation">{(["wallet","mining","explorer","network","settings"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} aria-current={tab===x?"page":undefined} onClick={()=>setTab(x)}><span>{ICONS[x]}</span><small>{x==="mining"?"Pool Stats":x.charAt(0).toUpperCase()+x.slice(1)}</small></button>)}</nav>
 </div>;
}
