import crypto from "crypto";

interface CalDavParams {
  caldavUrl: string;
  username: string;
  password: string;
}

export interface DiscoveredCalendar {
  name: string;
  url: string;
}

export function normalizeCalDavUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("URL CalDAV requise");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("URL CalDAV invalide");
  }

  if (url.protocol !== "https:") {
    throw new Error("L'URL CalDAV doit utiliser HTTPS");
  }

  return url.toString();
}

const basicAuthHeader = (username: string, password: string) => {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString(
    "base64"
  )}`;
};

const caldavRequest = async ({
  body,
  depth,
  method = "PROPFIND",
  params,
}: {
  body?: string;
  depth?: string;
  method?: string;
  params: CalDavParams;
}) => {
  const response = await fetch(params.caldavUrl, {
    method,
    headers: {
      Authorization: basicAuthHeader(params.username, params.password),
      ...(depth ? { Depth: depth } : {}),
      ...(body ? { "Content-Type": "application/xml; charset=utf-8" } : {}),
    },
    body,
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Identifiants CalDAV refusés");
  }

  if (!response.ok && response.status !== 207) {
    throw new Error(`Serveur CalDAV inaccessible (${response.status})`);
  }

  return response;
};

export async function testCalDavConnection(params: CalDavParams) {
  const caldavUrl = normalizeCalDavUrl(params.caldavUrl);

  await caldavRequest({
    params: { ...params, caldavUrl },
    depth: "0",
    body: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`,
  });

  return { ok: true as const };
}

export async function discoverCalendars(
  params: CalDavParams
): Promise<DiscoveredCalendar[]> {
  const caldavUrl = normalizeCalDavUrl(params.caldavUrl);

  try {
    const response = await caldavRequest({
      params: { ...params, caldavUrl },
      depth: "1",
      body: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:displayname/>
    <C:supported-calendar-component-set/>
  </D:prop>
</D:propfind>`,
    });
    const xml = await response.text();
    const calendars: DiscoveredCalendar[] = [];
    const responseBlocks = xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/gi) || [];

    for (const block of responseBlocks) {
      if (!/VEVENT/i.test(block)) continue;

      const href = block.match(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i)?.[1]?.trim();
      const displayName =
        block.match(/<[^:>]*:?displayname[^>]*>([\s\S]*?)<\/[^:>]*:?displayname>/i)?.[1]?.trim() ||
        "Calendrier Apple";

      if (!href) continue;

      const url = new URL(href, caldavUrl).toString();
      calendars.push({ name: displayName, url });
    }

    return calendars;
  } catch {
    return [];
  }
}

export function encryptCalDavPassword(password: string) {
  // TODO secure encryption before production: replace this reversible local
  // encoding with envelope encryption backed by a managed secret.
  const salt = crypto.randomBytes(8).toString("hex");
  return `placeholder-v1:${salt}:${Buffer.from(password, "utf8").toString(
    "base64"
  )}`;
}
