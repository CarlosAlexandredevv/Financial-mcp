import { normalizePublicUrl } from "./oauth";

export function readIssuer(): string | null {
  return normalizePublicUrl(process.env.MCP_PUBLIC_URL);
}

export function oauthDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}

export function isJsonContentType(header: string | null): boolean {
  if (header === null) return false;
  const value = header.split(";")[0]?.trim().toLowerCase();
  return value === "application/json";
}

export function isFormContentType(header: string | null): boolean {
  if (header === null) return false;
  const value = header.split(";")[0]?.trim().toLowerCase();
  return value === "application/x-www-form-urlencoded";
}

export function oauthErrorResponse(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export function redirectWithOAuthParams(
  redirectUri: string,
  params: Record<string, string | undefined>,
): Response {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
