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
  color?: string | null;
  writable: boolean;
}

export const READ_ONLY_APPLE_CALENDAR_URL_MESSAGE =
  "Cette URL est une URL Apple Calendar publiée en lecture seule. Elle peut servir à importer le calendrier, mais pas à écrire dedans. Sélectionnez un calendrier CalDAV détecté.";

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

export function isReadOnlyAppleCalendarUrl(input: string) {
  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.startsWith("webcal://") ||
    trimmed.includes("/published/2/") ||
    trimmed.endsWith(".ics")
  );
}

export function isWritableCalendarTargetUrl(input: string | null | undefined) {
  if (!input || !input.trim()) return false;

  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && !isReadOnlyAppleCalendarUrl(input);
  } catch {
    return false;
  }
}

export function assertWritableCalendarUrl(input: string) {
  if (!isWritableCalendarTargetUrl(input)) {
    throw new Error(READ_ONLY_APPLE_CALENDAR_URL_MESSAGE);
  }

  return normalizeCalDavUrl(input);
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
  const normalizedUrl = assertWritableCalendarUrl(calendarUrl);
  const baseUrl = normalizedUrl.endsWith("/") ? normalizedUrl : `${normalizedUrl}/`;

  return new URL(`${encodeURIComponent(uid)}.ics`, baseUrl).toString();
};

const ensureTrailingSlash = (value: string) => {
  return value.endsWith("/") ? value : `${value}/`;
};

const getResponseBlocks = (xml: string) => {
  return xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/gi) || [];
};

const getFirstHref = (xml: string) => {
  return xml.match(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i)?.[1]?.trim() || null;
};

const getFirstText = (xml: string, tagName: string) => {
  const pattern = new RegExp(
    `<[^:>]*:?${tagName}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tagName}>`,
    "i"
  );
  return xml.match(pattern)?.[1]?.trim() || null;
};

const toAbsoluteCalDavUrl = (href: string, baseUrl: string) => {
  return ensureTrailingSlash(new URL(href, baseUrl).toString());
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
    const principalResponse = await caldavRequest({
      params: { ...params, caldavUrl },
      depth: "0",
      body: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`,
    });

    const principalXml = await principalResponse.text();
    const principalHref = getFirstHref(
      getFirstText(principalXml, "current-user-principal") || principalXml
    );

    if (!principalHref) return [];

    const principalUrl = toAbsoluteCalDavUrl(principalHref, principalResponse.url || caldavUrl);
    const homeSetResponse = await caldavRequest({
      params: { ...params, caldavUrl: principalUrl },
      depth: "0",
      body: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`,
    });

    const homeSetXml = await homeSetResponse.text();
    const homeSetHref = getFirstHref(
      getFirstText(homeSetXml, "calendar-home-set") || homeSetXml
    );

    if (!homeSetHref) return [];

    const homeSetUrl = toAbsoluteCalDavUrl(homeSetHref, homeSetResponse.url || principalUrl);
    const calendarsResponse = await caldavRequest({
      params: { ...params, caldavUrl: homeSetUrl },
      depth: "1",
      body: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <D:current-user-privilege-set/>
    <C:supported-calendar-component-set/>
    <A:calendar-color/>
  </D:prop>
</D:propfind>`,
    });

    const xml = await calendarsResponse.text();
    const calendars: DiscoveredCalendar[] = [];

    for (const block of getResponseBlocks(xml)) {
      const resourceType = getFirstText(block, "resourcetype") || "";
      const supportedComponents =
        getFirstText(block, "supported-calendar-component-set") || "";
      const hasCalendarResource = /:?calendar\b/i.test(resourceType);
      const supportsEvents = /VEVENT/i.test(supportedComponents) || !supportedComponents;

      if (!hasCalendarResource || !supportsEvents) continue;

      const href = getFirstHref(block);
      if (!href) continue;

      const url = toAbsoluteCalDavUrl(href, calendarsResponse.url || homeSetUrl);
      if (isReadOnlyAppleCalendarUrl(url)) continue;

      const displayName = getFirstText(block, "displayname") || "Calendrier Apple";
      const color = getFirstText(block, "calendar-color");
      const privileges = getFirstText(block, "current-user-privilege-set") || "";
      const writable = /<[^:>]*:?write\b/i.test(privileges) || privileges === "";

      calendars.push({ name: displayName, url, color, writable });
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
