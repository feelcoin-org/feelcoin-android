// FEELCOIN_SEND_PRECHECK_V3: Map locally selected transaction inputs to
// locally derived key images. No mnemonic, spend key, or view key is sent.
export type SignInput = {global_index?: string|number; public_key?: string};
export type VerifiedOutput = {
  globalIndex?: number|string|null;
  outputPublicKey?: string;
  keyImage?: string;
  spent?: boolean;
  unlocked?: boolean;
};
const HEX64=/^[a-f0-9]{64}$/i;
const DECIMAL=/^(0|[1-9][0-9]*)$/;
function indexText(value:unknown):string {
  if (typeof value!=="string" && typeof value!=="number")throw new Error("Selected transaction input index is missing.");
  const str=String(value);
  if (!DECIMAL.test(str))throw new Error("Invalid selected input index.");
  return BigInt(str).toString();
}
// Only check inputs that the local transaction builder actually selected.
// If even one cannot be mapped unambiguously to a verified unlocked output,
// abort rather than silently falling back to cached spend status.
export function selectedKeyImages(outputs:readonly VerifiedOutput[], selected:readonly SignInput[]):string[] {
  if (!Array.isArray(outputs) || !Array.isArray(selected) || selected.length===0 || selected.length>4096)
    throw new Error("Invalid transaction input selection.");
  const byKey=new Map<string,VerifiedOutput>();
  for(const output of outputs){
    if(output.spent!==false || output.unlocked!==true)continue;
    if(!HEX64.test(output.outputPublicKey||""))continue;
    let index:string;
    try { index=indexText(output.globalIndex); }
    catch { continue; } // Ignore unrelated, incomplete outputs; fail closed for selected ones.
    const key=index+":"+output.outputPublicKey!.toLowerCase();
    if(byKey.has(key))throw new Error("Duplicate wallet output in verified state.");
    byKey.set(key,output);
  }
  const used=new Set<string>();
  const images:string[]=[];
  for(const input of selected){
    if(!HEX64.test(input.public_key||""))throw new Error("Unverifiable selected input public key.");
    const key=indexText(input.global_index)+":"+input.public_key!.toLowerCase();
    if(used.has(key))throw new Error("Duplicate selected transaction input.");
    used.add(key);
    const output=byKey.get(key);
    if(!output || !HEX64.test(output.keyImage||""))
      throw new Error("Selected input is missing a verified key image. Refresh wallet before sending.");
    images.push(output.keyImage!.toLowerCase());
  }
  if(new Set(images).size!==images.length)throw new Error("Duplicate selected wallet key image.");
  return images;
}
