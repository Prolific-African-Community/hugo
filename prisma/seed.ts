import {
  AccountingStandard,
  EntityRole,
  EntityType,
  InvoiceStatus,
  OrganizationRole,
  OrganizationStatus,
  OrganizationType,
  PatientStatus,
  PlatformRole,
  PrescriptionStatus,
  PrismaClient,
  TherapySessionStatus,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const HUGO_EMAIL = "hugo@local.test";
const HUGO_PASSWORD = "kine1234";
const HUGO_ORGANIZATION_NAME = "Cabinet Hugo";
const HUGO_ENTITY_NAME = "Cabinet Hugo";

const LEGACY_ADMIN_EMAIL = "admin@proliquid.local";
const LEGACY_ORGANIZATION_NAME = "Hugo Demo Cabinet";
const LEGACY_ENTITY_NAME = "Hugo Demo Workspace";
const LEGACY_TEMPLATE_NAME = "Legacy Starter Template";

const daysFromToday = (days: number, hour = 9, minute = 0) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const findOrganizationByName = (name: string) => {
  return prisma.organization.findFirst({ where: { name } });
};

const findEntityByName = (organizationId: string, name: string) => {
  return prisma.entity.findFirst({ where: { organizationId, name } });
};

const cleanupLegacySeed = async () => {
  const legacyOrganization = await findOrganizationByName(
    LEGACY_ORGANIZATION_NAME
  );

  if (legacyOrganization) {
    const legacyEntity = await findEntityByName(
      legacyOrganization.id,
      LEGACY_ENTITY_NAME
    );

    if (legacyEntity) {
      await prisma.accountingRule.deleteMany({
        where: { entityId: legacyEntity.id },
      });
      await prisma.accountingPeriod.deleteMany({
        where: { entityId: legacyEntity.id },
      });
      await prisma.chartOfAccount.updateMany({
        where: { entityId: legacyEntity.id },
        data: { isActive: false },
      });
      await prisma.entity.update({
        where: { id: legacyEntity.id },
        data: {
          accountingTemplateId: null,
          accountingInitializedAt: null,
          isActive: false,
        },
      });
    }

    await prisma.organization.update({
      where: { id: legacyOrganization.id },
      data: {
        status: OrganizationStatus.INACTIVE,
        isActive: false,
      },
    });
  }

  const legacyTemplate = await prisma.accountingTemplate.findFirst({
    where: { name: LEGACY_TEMPLATE_NAME },
  });

  if (legacyTemplate) {
    await prisma.accountingTemplate.update({
      where: { id: legacyTemplate.id },
      data: { isActive: false },
    });
    await prisma.accountingTemplateRule.deleteMany({
      where: { templateId: legacyTemplate.id },
    });
    await prisma.accountingTemplateAccount.deleteMany({
      where: { templateId: legacyTemplate.id },
    });
  }

  const legacyAdmin = await prisma.user.findUnique({
    where: { email: LEGACY_ADMIN_EMAIL },
    select: { id: true },
  });

  if (legacyAdmin) {
    await prisma.entityUser.deleteMany({ where: { userId: legacyAdmin.id } });
    await prisma.organizationUser.deleteMany({
      where: { userId: legacyAdmin.id },
    });
    await prisma.user.delete({ where: { id: legacyAdmin.id } });
  }
};

const upsertHugoWorkspace = async () => {
  const password = await bcrypt.hash(HUGO_PASSWORD, 12);

  const hugoUser = await prisma.user.upsert({
    where: { email: HUGO_EMAIL },
    update: {
      password,
      role: UserRole.USER,
      platformRole: PlatformRole.NONE,
      mustChangePassword: false,
    },
    create: {
      email: HUGO_EMAIL,
      password,
      role: UserRole.USER,
      platformRole: PlatformRole.NONE,
      mustChangePassword: false,
    },
  });

  const organizationData = {
    name: HUGO_ORGANIZATION_NAME,
    legalName: HUGO_ORGANIZATION_NAME,
    type: OrganizationType.COMPANY,
    country: "LU",
    baseCurrency: "EUR",
    status: OrganizationStatus.ACTIVE,
    isActive: true,
  };

  const existingOrganization = await findOrganizationByName(
    HUGO_ORGANIZATION_NAME
  );
  const organization = existingOrganization
    ? await prisma.organization.update({
        where: { id: existingOrganization.id },
        data: organizationData,
      })
    : await prisma.organization.create({ data: organizationData });

  const entityData = {
    organizationId: organization.id,
    name: HUGO_ENTITY_NAME,
    legalName: HUGO_ENTITY_NAME,
    type: EntityType.COMPANY,
    country: "LU",
    baseCurrency: "EUR",
    accountingStandard: AccountingStandard.LUX_GAAP,
    accountingTemplateId: null,
    accountingInitializedAt: null,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    isActive: true,
  };

  const existingEntity = await findEntityByName(
    organization.id,
    HUGO_ENTITY_NAME
  );
  const entity = existingEntity
    ? await prisma.entity.update({
        where: { id: existingEntity.id },
        data: entityData,
      })
    : await prisma.entity.create({ data: entityData });

  await prisma.organizationUser.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: hugoUser.id,
      },
    },
    update: {
      role: OrganizationRole.ORG_ADMIN,
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      userId: hugoUser.id,
      role: OrganizationRole.ORG_ADMIN,
      isActive: true,
    },
  });

  await prisma.entityUser.upsert({
    where: {
      entityId_userId: {
        entityId: entity.id,
        userId: hugoUser.id,
      },
    },
    update: {
      role: EntityRole.ENTITY_ADMIN,
      isActive: true,
    },
    create: {
      entityId: entity.id,
      userId: hugoUser.id,
      role: EntityRole.ENTITY_ADMIN,
      isActive: true,
    },
  });

  return { hugoUser, organization, entity };
};

const cleanupHugoMocks = async (entityId: string) => {
  await prisma.invoice.deleteMany({ where: { entityId } });
  await prisma.therapySession.deleteMany({ where: { entityId } });
  await prisma.prescription.deleteMany({ where: { entityId } });
  await prisma.patient.deleteMany({ where: { entityId } });
};

const createPatients = async (entityId: string) => {
  const patients = [
    {
      firstName: "Claire",
      lastName: "Muller",
      email: "claire.muller@example.test",
      phone: "+352 621 111 001",
      address: "12 Rue des Bains, L-1212 Luxembourg",
      cnsNumber: "1990010112345",
      status: PatientStatus.ACTIVE,
      notes: "Reprise après lombalgie, préfère rendez-vous matin.",
    },
    {
      firstName: "Marc",
      lastName: "Weber",
      email: "marc.weber@example.test",
      phone: "+352 621 111 002",
      address: "8 Avenue de la Gare, L-1610 Luxembourg",
      cnsNumber: "1988071512345",
      status: PatientStatus.ACTIVE,
      notes: "Rééducation genou, sportif.",
    },
    {
      firstName: "Sophie",
      lastName: "Laurent",
      email: "sophie.laurent@example.test",
      phone: "+352 621 111 003",
      address: "4 Rue du Fort, L-2340 Luxembourg",
      cnsNumber: "1979120312345",
      status: PatientStatus.ACTIVE,
      notes: "Douleurs cervicales, agenda variable.",
    },
    {
      firstName: "Amir",
      lastName: "Benali",
      email: "amir.benali@example.test",
      phone: "+352 621 111 004",
      address: "21 Rue de Hollerich, L-1741 Luxembourg",
      cnsNumber: "1992052212345",
      status: PatientStatus.ACTIVE,
      notes: "Épaule droite, séances en fin de journée.",
    },
    {
      firstName: "Elise",
      lastName: "Hoffmann",
      email: "elise.hoffmann@example.test",
      phone: "+352 621 111 005",
      address: "6 Rue Jean Origer, L-2269 Luxembourg",
      cnsNumber: "1968110912345",
      status: PatientStatus.ACTIVE,
      notes: "Suivi post-opératoire, attention fatigue.",
    },
  ];

  const createdPatients = await Promise.all(
    patients.map((patient) =>
      prisma.patient.create({
        data: {
          entityId,
          ...patient,
        },
      })
    )
  );

  return Object.fromEntries(
    createdPatients.map((patient) => [patient.firstName, patient])
  );
};

const createPrescriptions = async (
  entityId: string,
  patients: Awaited<ReturnType<typeof createPatients>>
) => {
  const prescriptions = await Promise.all([
    prisma.prescription.create({
      data: {
        entityId,
        patientId: patients.Claire.id,
        title: "Rééducation lombaire",
        prescribedSessions: 20,
        completedSessions: 0,
        startDate: daysFromToday(-35),
        status: PrescriptionStatus.ACTIVE,
        notes: "Programme progressif de stabilisation lombaire.",
      },
    }),
    prisma.prescription.create({
      data: {
        entityId,
        patientId: patients.Marc.id,
        title: "Rééducation genou droit",
        prescribedSessions: 15,
        completedSessions: 0,
        startDate: daysFromToday(-20),
        status: PrescriptionStatus.ACTIVE,
        notes: "Renforcement et reprise sportive progressive.",
      },
    }),
    prisma.prescription.create({
      data: {
        entityId,
        patientId: patients.Sophie.id,
        title: "Cervicalgies chroniques",
        prescribedSessions: 10,
        completedSessions: 0,
        startDate: daysFromToday(-45),
        endDate: daysFromToday(-2),
        status: PrescriptionStatus.COMPLETED,
        notes: "Cycle terminé, suivi ponctuel à prévoir si récidive.",
      },
    }),
    prisma.prescription.create({
      data: {
        entityId,
        patientId: patients.Elise.id,
        title: "Suivi post-opératoire",
        prescribedSessions: 30,
        completedSessions: 0,
        startDate: daysFromToday(-25),
        status: PrescriptionStatus.ACTIVE,
        notes: "Progression douce, surveiller la fatigue.",
      },
    }),
  ]);

  return Object.fromEntries(
    prescriptions.map((prescription) => [prescription.title, prescription])
  );
};

const createSessions = async (
  entityId: string,
  patients: Awaited<ReturnType<typeof createPatients>>,
  prescriptions: Awaited<ReturnType<typeof createPrescriptions>>
) => {
  const sessions = [
    ...Array.from({ length: 18 }).map((_, index) => ({
      patientId: patients.Claire.id,
      prescriptionId: prescriptions["Rééducation lombaire"].id,
      sessionNumber: index + 1,
      status: TherapySessionStatus.COMPLETED,
      scheduledAt: daysFromToday(-36 + index * 2, 8, 30),
      completedAt: daysFromToday(-36 + index * 2, 9, 15),
      notes: "Séance lombaire réalisée.",
    })),
    {
      patientId: patients.Claire.id,
      prescriptionId: prescriptions["Rééducation lombaire"].id,
      sessionNumber: 19,
      status: TherapySessionStatus.PLANNED,
      scheduledAt: daysFromToday(0, 9, 0),
      completedAt: null,
      notes: "Point sur douleurs matinales.",
    },
    ...Array.from({ length: 4 }).map((_, index) => ({
      patientId: patients.Marc.id,
      prescriptionId: prescriptions["Rééducation genou droit"].id,
      sessionNumber: index + 1,
      status: TherapySessionStatus.COMPLETED,
      scheduledAt: daysFromToday(-18 + index * 4, 17, 30),
      completedAt: daysFromToday(-18 + index * 4, 18, 15),
      notes: "Renforcement genou droit.",
    })),
    {
      patientId: patients.Marc.id,
      prescriptionId: prescriptions["Rééducation genou droit"].id,
      sessionNumber: 5,
      status: TherapySessionStatus.PLANNED,
      scheduledAt: daysFromToday(0, 14, 30),
      completedAt: null,
      notes: "Travail proprioception.",
    },
    ...Array.from({ length: 10 }).map((_, index) => ({
      patientId: patients.Sophie.id,
      prescriptionId: prescriptions["Cervicalgies chroniques"].id,
      sessionNumber: index + 1,
      status: TherapySessionStatus.COMPLETED,
      scheduledAt: daysFromToday(-40 + index * 4, 11, 0),
      completedAt: daysFromToday(-40 + index * 4, 11, 45),
      notes: "Mobilité cervicale.",
    })),
    ...Array.from({ length: 6 }).map((_, index) => ({
      patientId: patients.Elise.id,
      prescriptionId: prescriptions["Suivi post-opératoire"].id,
      sessionNumber: index + 1,
      status: TherapySessionStatus.COMPLETED,
      scheduledAt: daysFromToday(-24 + index * 4, 10, 30),
      completedAt: daysFromToday(-24 + index * 4, 11, 15),
      notes: "Suivi post-opératoire réalisé.",
    })),
    {
      patientId: patients.Elise.id,
      prescriptionId: prescriptions["Suivi post-opératoire"].id,
      sessionNumber: 7,
      status: TherapySessionStatus.PLANNED,
      scheduledAt: daysFromToday(2, 10, 0),
      completedAt: null,
      notes: "Progression douce.",
    },
  ];

  await Promise.all(
    sessions.map((session) =>
      prisma.therapySession.create({
        data: {
          entityId,
          ...session,
        },
      })
    )
  );

  return sessions.length;
};

const recomputePrescriptionCompletedSessions = async (
  entityId: string,
  prescriptionIds: string[]
) => {
  await Promise.all(
    prescriptionIds.map(async (prescriptionId) => {
      const completedSessions = await prisma.therapySession.count({
        where: {
          entityId,
          prescriptionId,
          status: TherapySessionStatus.COMPLETED,
        },
      });

      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: { completedSessions },
      });
    })
  );
};

const createInvoices = async (
  entityId: string,
  patients: Awaited<ReturnType<typeof createPatients>>,
  prescriptions: Awaited<ReturnType<typeof createPrescriptions>>
) => {
  // Invoice is used here as internal CNS billing tracking, not as official invoice generation.
  await prisma.invoice.create({
    data: {
      entityId,
      patientId: patients.Sophie.id,
      prescriptionId: prescriptions["Cervicalgies chroniques"].id,
      invoiceNumber: "CNS-2026-0001",
      status: InvoiceStatus.PAID,
      amountCents: 72000,
      currency: "EUR",
      issuedAt: daysFromToday(-10, 9, 0),
      dueAt: daysFromToday(20, 9, 0),
      paidAt: daysFromToday(-3, 9, 0),
    },
  });

  await prisma.invoice.create({
    data: {
      entityId,
      patientId: patients.Claire.id,
      prescriptionId: prescriptions["Rééducation lombaire"].id,
      invoiceNumber: null,
      status: InvoiceStatus.DRAFT,
      amountCents: 0,
      currency: "EUR",
      issuedAt: null,
      dueAt: null,
      paidAt: null,
    },
  });

  return 2;
};

async function main() {
  await cleanupLegacySeed();

  const { entity } = await upsertHugoWorkspace();

  await cleanupHugoMocks(entity.id);

  const patients = await createPatients(entity.id);
  const prescriptions = await createPrescriptions(entity.id, patients);
  const sessionCount = await createSessions(entity.id, patients, prescriptions);

  await recomputePrescriptionCompletedSessions(
    entity.id,
    Object.values(prescriptions).map((prescription) => prescription.id)
  );

  const invoiceCount = await createInvoices(entity.id, patients, prescriptions);

  console.log("Hugo seed completed");
  console.log(`Login email: ${HUGO_EMAIL}`);
  console.log("Initial password: kine1234");
  console.log(`Patients: ${Object.keys(patients).length}`);
  console.log(`Prescriptions: ${Object.keys(prescriptions).length}`);
  console.log(`Séances: ${sessionCount}`);
  console.log(`Factures: ${invoiceCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
