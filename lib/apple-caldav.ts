import crypto from "crypto";

interface CalDavParams {
  caldavUrl: string;
  username: string;
  password: string;
}

interface CreateCalDavEventParams {
  selectedCalendarUrl: string;
  username: string;
  password: string;
  uid?: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  description?: string | null;
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

const escapeIcsText = (value: string) => {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

const formatIcsDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Date calendrier invalide");
  }

  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

const buildEventUrl = (calendarUrl: string, uid: string) => {
  const normalizedUrl = normalizeCalDavUrl(calendarUrl);
  const baseUrl = normalizedUrl.endsWith("/") ? normalizedUrl : `${normalizedUrl}/`;

  return new URL(`${encodeURIComponent(uid)}.ics`, baseUrl).toString();
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

export function decryptCalDavPassword(encryptedPassword: string) {
  // TODO secure encryption before production: replace this placeholder decoder
  // with the matching managed-secret decryption implementation.
  const [, , encodedPassword] = encryptedPassword.split(":");

  if (!encryptedPassword.startsWith("placeholder-v1:") || !encodedPassword) {
    throw new Error("Configuration CalDAV illisible");
  }

  return Buffer.from(encodedPassword, "base64").toString("utf8");
}

export async function createCalDavEvent(params: CreateCalDavEventParams) {
  if (!params.selectedCalendarUrl.trim()) {
    throw new Error("Calendrier Apple Calendar cible manquant");
  }

  const startsAt = params.startsAt instanceof Date ? params.startsAt : new Date(params.startsAt);
  const endsAt = params.endsAt instanceof Date ? params.endsAt : new Date(params.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Dates de rendez-vous invalides");
  }

  if (endsAt <= startsAt) {
    throw new Error("La fin du rendez-vous doit être après le début");
  }

  const uid = params.uid || `hugo-${crypto.randomUUID()}`;
  const eventUrl = buildEventUrl(params.selectedCalendarUrl, uid);
  const description = params.description?.trim();
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hugo//Calendar Sync//FR",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  const response = await fetch(eventUrl, {
    method: "PUT",
    headers: {
      Authorization: basicAuthHeader(params.username, params.password),
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*",
    },
    body: ics,
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Identifiants CalDAV refusés");
  }

  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`Création Apple Calendar refusée (${response.status})`);
  }

  return {
    externalEventId: uid,
    externalCalendarUrl: params.selectedCalendarUrl,
    status: response.status,
    etag: response.headers.get("etag"),
  };
}
