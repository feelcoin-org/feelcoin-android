// FEELCOIN_DURABLE_SCAN_CHECKPOINT_V3
// Browser-side scan metadata only: no mnemonic or private spend/view keys.
// The separate wallet vault remains password encrypted.
// Using IndexedDB reduces quota failures common with large mining histories.
const DB_NAME = "feelcoin.android.scan-state.v3";
const STORE_NAME = "checkpoints";
const LEGACY_PREFIX = "feelcoin.android.scan.v1.";
const VERSION = 1;

type BaseScan = {
  scannedHeight: number;
  chainHeight: number;
  restoreHeight?: number;
  lastBlockHash?: string | null;
  ownedOutputs?: unknown[];
  incoming?: unknown[];
  outgoing?: unknown[];
};

function encode(address:string,state:BaseScan):string {
  return JSON.stringify({version:VERSION,address,state},(_key,value)=>
    typeof value === "bigint" ? {__feelcoinBigInt:value.toString()} : value);
}
function decode<T extends BaseScan>(address:string,raw:string|null):T|null {
  if(!raw)return null;
  try {
    const entry=JSON.parse(raw,(_key,value)=>
      value && typeof value === "object" && Object.keys(value).length===1 &&
      typeof value.__feelcoinBigInt === "string" && /^-?\d+$/.test(value.__feelcoinBigInt)
        ? BigInt(value.__feelcoinBigInt) : value);
    const s=entry?.state as T|undefined;
    if(entry?.version!==VERSION||entry?.address!==address||!s||
       !Number.isSafeInteger(s.scannedHeight)||s.scannedHeight<0||
       !Number.isSafeInteger(s.chainHeight)||s.chainHeight<=0||
       !Number.isSafeInteger(s.restoreHeight)||Number(s.restoreHeight)<0||
       !Array.isArray(s.ownedOutputs)||!Array.isArray(s.incoming)||!Array.isArray(s.outgoing)||
       typeof s.lastBlockHash!=="string" || !/^[0-9a-f]{64}$/i.test(s.lastBlockHash))return null;
    return s;
  } catch {return null;}
}

function dbOpen():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB === "undefined") {reject(new Error("IDB_UNAVAILABLE"));return;}
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error("IDB_OPEN_FAILED"));
    request.onblocked=()=>reject(new Error("IDB_BLOCKED"));
  });
}
async function idbPut(address:string,raw:string):Promise<void> {
  const db=await dbOpen();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readwrite");
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error("IDB_WRITE_FAILED"));
      tx.onabort=()=>reject(new Error("IDB_ABORTED"));
      tx.objectStore(STORE_NAME).put(raw,address);
    });
  } finally {db.close();}
}
async function idbGet(address:string):Promise<string|null> {
  const db=await dbOpen();
  try {
    return await new Promise<string|null>((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readonly");
      const request=tx.objectStore(STORE_NAME).get(address);
      request.onsuccess=()=>resolve(typeof request.result==="string"?request.result:null);
      request.onerror=()=>reject(new Error("IDB_READ_FAILED"));
    });
  } finally {db.close();}
}

// All saves are queued; the final completed scan always lands after prior partial writes.
let writeTail:Promise<unknown> = Promise.resolve();
export function saveScanCheckpoint(address:string,state:BaseScan):Promise<boolean> {
  const write=async():Promise<boolean>=>{
    let raw:string;
    try {raw=encode(address,state);} catch {return false;}
    try {
      await idbPut(address,raw);
      if(await idbGet(address)===raw)return true;
    }catch{ /* Fall back to legacy storage only if IndexedDB fails. */ }
    try {
      localStorage.setItem(LEGACY_PREFIX+address,raw);
      return localStorage.getItem(LEGACY_PREFIX+address)===raw;
    }catch{return false;}
  };
  const job=writeTail.then(write,write);
  writeTail=job.then(()=>{},()=>{});
  return job;
}
export async function loadScanCheckpoint<T extends BaseScan>(address:string):Promise<T|null> {
  try {
    const candidate=decode<T>(address,await idbGet(address));
    if(candidate)return candidate;
  }catch{ /* legacy fallback */ }
  try {return decode<T>(address,localStorage.getItem(LEGACY_PREFIX+address));}
  catch{return null;}
}
