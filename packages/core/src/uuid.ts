/**
 * UUID v7: time-ordered ids, as required for Tasks.
 * Layout: 48-bit Unix ms timestamp, version 7, 12 random bits, variant 10, 62 random bits.
 */
export function uuidv7(at: Date, random: () => number = Math.random): string {
  const bytes = new Uint8Array(16);

  let time = BigInt(at.getTime());
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(time & 0xffn);
    time >>= 8n;
  }

  for (let i = 6; i < 16; i++) {
    bytes[i] = Math.floor(random() * 256);
  }

  // Version 7.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // RFC 4122 variant.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
