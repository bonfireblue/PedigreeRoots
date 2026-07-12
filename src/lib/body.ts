export type ReadJsonResult =
  | { ok: true; json: any }
  | { ok: false; error: string };

export async function readJson(req: Request, maxBytes = 100_000): Promise<ReadJsonResult> {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false, error: "PAYLOAD_TOO_LARGE" };
    }
  }

  // Read raw body
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > maxBytes) return { ok: false, error: "PAYLOAD_TOO_LARGE" };

  try {
    const text = buf.toString("utf8");
    const json = text.length ? JSON.parse(text) : {};
    return { ok: true, json };
  } catch {
    return { ok: false, error: "INVALID_JSON" };
  }
}
