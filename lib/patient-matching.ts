export interface MatchablePatient {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PatientMatchResult {
  patientId: string | null;
  confidence: number;
  reason: string;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (value: string) => normalize(value).split(/\s+/).filter(Boolean);

const hasToken = (tokens: string[], token: string) => tokens.includes(token);

const hasPartialToken = (tokens: string[], token: string) => {
  return tokens.some(
    (candidate) =>
      candidate.length >= 2 &&
      token.length >= 2 &&
      (candidate.startsWith(token) || token.startsWith(candidate))
  );
};

const hasInitialToken = (tokens: string[], token: string) => {
  return Boolean(token) && tokens.includes(token.slice(0, 1));
};

const scorePatient = (
  title: string,
  tokens: string[],
  patient: MatchablePatient
): PatientMatchResult => {
  const firstName = normalize(patient.firstName);
  const lastName = normalize(patient.lastName);
  const fullName = `${firstName} ${lastName}`;
  const reversedName = `${lastName} ${firstName}`;
  const firstExact = hasToken(tokens, firstName);
  const lastExact = hasToken(tokens, lastName);
  const firstPartial =
    hasPartialToken(tokens, firstName) || hasInitialToken(tokens, firstName);
  const lastPartial =
    hasPartialToken(tokens, lastName) || hasInitialToken(tokens, lastName);

  if (title.includes(fullName)) {
    return {
      patientId: patient.id,
      confidence: 0.98,
      reason: "Prénom + nom exact dans le titre",
    };
  }

  if (title.includes(reversedName)) {
    return {
      patientId: patient.id,
      confidence: 0.94,
      reason: "Nom + prénom exact dans le titre",
    };
  }

  if (firstExact && lastExact) {
    return {
      patientId: patient.id,
      confidence: 0.9,
      reason: "Prénom et nom exacts détectés",
    };
  }

  if (firstExact && lastPartial) {
    return {
      patientId: patient.id,
      confidence: 0.76,
      reason: "Prénom exact et nom partiel détectés",
    };
  }

  if (lastExact && firstPartial) {
    return {
      patientId: patient.id,
      confidence: 0.72,
      reason: "Nom exact et prénom partiel détectés",
    };
  }

  if (lastExact) {
    return {
      patientId: patient.id,
      confidence: 0.48,
      reason: "Nom seul détecté",
    };
  }

  if (firstExact) {
    return {
      patientId: patient.id,
      confidence: 0.42,
      reason: "Prénom seul détecté",
    };
  }

  return {
    patientId: null,
    confidence: 0,
    reason: "Aucune correspondance patient",
  };
};

export const matchPatientFromEventTitle = (
  title: string,
  patients: MatchablePatient[]
): PatientMatchResult => {
  const normalizedTitle = normalize(title);
  const tokens = tokenize(title);

  const bestMatch = patients
    .map((patient) => scorePatient(normalizedTitle, tokens, patient))
    .sort((left, right) => right.confidence - left.confidence)[0];

  return (
    bestMatch || {
      patientId: null,
      confidence: 0,
      reason: "Aucun patient disponible pour le matching",
    }
  );
};
