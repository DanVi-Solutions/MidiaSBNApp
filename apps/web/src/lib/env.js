function normalizeApiHost(rawValue) {
  const trimmed = String(rawValue ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export const API_HOST = normalizeApiHost(process.env.NEXT_PUBLIC_API_HOST);
