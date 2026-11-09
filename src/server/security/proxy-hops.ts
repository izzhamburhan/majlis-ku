// A start-up diagnostic for TRUSTED_PROXY_HOPS (spec criterion 15): how many entries does x-forwarded-for really have
// on this host? The line states a count and whether x-real-ip is present, never an address, so it is safe to log.

/** "[proxy-hops] entries=2 x-real-ip=absent": counts only, no address. */
export function proxyHopsLine(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const entries = forwarded.split(",").filter((part) => part.trim() !== "").length;
  const realIp = (headers.get("x-real-ip") ?? "").trim() !== "" ? "present" : "absent";
  return `[proxy-hops] entries=${entries} x-real-ip=${realIp}`;
}

/** A logger that writes the line for the first `limit` calls after start, and nothing when not enabled. */
export function createProxyHopsLogger({
  enabled,
  limit,
  write = (line) => console.log(line),
}: {
  enabled: boolean;
  limit: number;
  write?: (line: string) => void;
}): (headers: Pick<Headers, "get">) => void {
  let logged = 0;
  return (headers) => {
    if (!enabled || logged >= limit) return;
    logged += 1;
    write(proxyHopsLine(headers));
  };
}