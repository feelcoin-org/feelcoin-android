// FEELCOIN ANDROID QR V2. Accept only a public FEEL address or a constrained FEEL URI.
export type FeelcoinQrPayload = { address: string; amount?: string };
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{90,110}$/;
const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/;
export function parseFeelcoinQr(raw: string): FeelcoinQrPayload {
  const data = raw.trim();
  if (data.length > 1000) throw new Error("QR content is too long.");
  let address = data;
  let amount: string | undefined;
  if (/^feelcoin:/i.test(data)) {
    const rest = data.slice("feelcoin:".length);
    if (rest.startsWith("//")) throw new Error("Unsupported payment URI format.");
    const q = rest.indexOf("?");
    address = q === -1 ? rest : rest.slice(0, q);
    if (q !== -1) {
      const query = rest.slice(q+1);
      if (!/^amount=[0-9]+(?:\.[0-9]{1,12})?$/.test(query))
        throw new Error("Unsupported payment parameter.");
      amount = query.slice("amount=".length);
    }
  }
  if (!ADDRESS.test(address)) throw new Error("This QR code does not contain a valid FEEL address.");
  if (amount !== undefined && (!AMOUNT.test(amount) || amount === "0" || !/[1-9]/.test(amount)))
    throw new Error("Invalid FEEL amount in QR code.");
  return {address, ...(amount === undefined ? {} : {amount})};
}
