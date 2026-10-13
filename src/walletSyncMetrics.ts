// UI-only metrics. No blockchain height or ETA is ever fabricated.
export type SyncSample={height:number;time:number};
export function syncPercent(scanned:number,chain:number,restore:number):number|null {
 if(!Number.isSafeInteger(scanned)||!Number.isSafeInteger(chain)||!Number.isSafeInteger(restore)||chain<=0||restore<0||chain<=restore)return null;
 const fraction=(Math.max(restore,Math.min(scanned,chain))-restore)/(chain-restore);
 return Math.round(1000*fraction)/10;
}
export function syncRemaining(scanned:number,chain:number):number|null {
 if(!Number.isSafeInteger(scanned)||!Number.isSafeInteger(chain)||chain<=0||scanned<0)return null;
 return Math.max(0,chain-scanned);
}
export function syncRate(samples:SyncSample[]):number|null {
 if(samples.length<2)return null;
 const first=samples[0];const last=samples[samples.length-1];
 if(last.time-first.time<8000 || last.height-first.height<10 || last.time<=first.time)return null;
 const rate=(last.height-first.height)/((last.time-first.time)/1000);
 return Number.isFinite(rate)&&rate>0?rate:null;
}
export function syncEta(remaining:number,rate:number|null):number|null {
 if(!Number.isFinite(remaining)||remaining<0||rate===null||!Number.isFinite(rate)||rate<=0)return null;
 const seconds=remaining/rate;
 // Avoid confident ETA for absurd extrapolations; wait for a stable sample.
 return Number.isFinite(seconds)&&seconds>=0&&seconds<=86400?Math.ceil(seconds):null;
}
export function formatSyncEta(seconds:number):string {
 if(seconds<60)return `About ${Math.max(1,Math.ceil(seconds))}s`;
 if(seconds<3600)return `About ${Math.ceil(seconds/60)} min`;
 return `About ${Math.ceil(seconds/3600)} hr`;
}
