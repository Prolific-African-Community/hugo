const TECHNICAL_NOTE_PATTERNS = [
  /^\s*\[Apple Calendar UID:.*\]\s*$/i,
  /^\s*\[Apple Calendar mock:.*\]\s*$/i,
  /^\s*confidence\s*[:=].*$/i,
  /^\s*reason\s*[:=].*$/i,
  /^\s*matchedAutomatically\s*[:=].*$/i,
  /^\s*Validation manuelle depuis Connexion agenda\s*$/i,
  /^\s*Patient cree depuis l'evenement Apple Calendar\s*$/i,
  /^\s*Patient créé depuis l'événement Apple Calendar\s*$/i,
];

const isTechnicalCalendarNoteLine = (line: string) => {
  return TECHNICAL_NOTE_PATTERNS.some((pattern) => pattern.test(line));
};

export function cleanCalendarNotes(notes?: string | null) {
  if (!notes) return "";

  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isTechnicalCalendarNoteLine(line))
    .join("\n")
    .trim();
}

export function preserveCalendarTechnicalNotes(
  originalNotes?: string | null,
  visibleNotes?: string | null
) {
  const technicalLines = (originalNotes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(isTechnicalCalendarNoteLine);

  const cleanedVisibleNotes = (visibleNotes || "").trim();

  return [...technicalLines, cleanedVisibleNotes]
    .filter(Boolean)
    .join("\n")
    .trim();
}
