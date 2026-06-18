import {
  AccountType,
  AccountingStandard,
  EntityRole,
  EntityType,
  OrganizationStatus,
  OrganizationRole,
  OrganizationType,
  PlatformRole,
  PrismaClient,
  TransactionType,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@proliquid.local';
const ADMIN_PASSWORD = 'Admin123!';
const HUGO_EMAIL = 'hugo@local.test';
const HUGO_PASSWORD = 'kine1234';
const HUGO_ORGANIZATION_NAME = 'Cabinet Hugo';
const HUGO_ENTITY_NAME = 'Cabinet Hugo';
const ORGANIZATION_NAME = 'Hugo Demo Cabinet';
const ENTITY_NAME = 'Hugo Demo Workspace';
const TEMPLATE_NAME = 'Legacy Starter Template';
const TEMPLATE_VERSION = '1.0.0';

const accounts = [
  { code: '101000', label: 'Capital', accountClass: '1', type: AccountType.EQUITY },
  { code: '401000', label: 'Suppliers', accountClass: '4', type: AccountType.LIABILITY },
  { code: '411000', label: 'Customers', accountClass: '4', type: AccountType.ASSET },
  { code: '451000', label: 'VAT Payable / Receivable', accountClass: '4', type: AccountType.LIABILITY },
  { code: '513000', label: 'Bank', accountClass: '5', type: AccountType.ASSET },
  { code: '600000', label: 'Purchases / Expenses', accountClass: '6', type: AccountType.EXPENSE },
  { code: '626000', label: 'Bank Fees', accountClass: '6', type: AccountType.EXPENSE },
  { code: '706000', label: 'Services Revenue', accountClass: '7', type: AccountType.INCOME },
];

const rules = [
  {
    transactionType: TransactionType.CUSTOMER_INVOICE,
    debitAccountCode: '411000',
    creditAccountCode: '706000',
    descriptionTemplate: 'Customer invoice - {description}',
  },
  {
    transactionType: TransactionType.CUSTOMER_PAYMENT,
    debitAccountCode: '513000',
    creditAccountCode: '411000',
    descriptionTemplate: 'Customer payment - {description}',
  },
  {
    transactionType: TransactionType.SUPPLIER_INVOICE,
    debitAccountCode: '600000',
    creditAccountCode: '401000',
    descriptionTemplate: 'Supplier invoice - {description}',
  },
  {
    transactionType: TransactionType.SUPPLIER_PAYMENT,
    debitAccountCode: '401000',
    creditAccountCode: '513000',
    descriptionTemplate: 'Supplier payment - {description}',
  },
  {
    transactionType: TransactionType.BANK_FEE,
    debitAccountCode: '626000',
    creditAccountCode: '513000',
    descriptionTemplate: 'Bank fee - {description}',
  },
];

async function main() {
  const password = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const hugoPassword = await bcrypt.hash(HUGO_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      password,
      role: UserRole.ADMIN,
      platformRole: PlatformRole.SUPER_ADMIN,
      mustChangePassword: false,
    },
    create: {
      email: ADMIN_EMAIL,
      password,
      role: UserRole.ADMIN,
      platformRole: PlatformRole.SUPER_ADMIN,
      mustChangePassword: false,
    },
  });

  const hugoUser = await prisma.user.upsert({
    where: { email: HUGO_EMAIL },
    update: {
      password: hugoPassword,
      role: UserRole.USER,
      platformRole: PlatformRole.NONE,
      mustChangePassword: false,
    },
    create: {
      email: HUGO_EMAIL,
      password: hugoPassword,
      role: UserRole.USER,
      platformRole: PlatformRole.NONE,
      mustChangePassword: false,
    },
  });

  const existingHugoOrganization = await prisma.organization.findFirst({
    where: { name: HUGO_ORGANIZATION_NAME },
  });

  const hugoOrganizationData = {
    name: HUGO_ORGANIZATION_NAME,
    legalName: HUGO_ORGANIZATION_NAME,
    type: OrganizationType.COMPANY,
    country: 'LU',
    baseCurrency: 'EUR',
    status: OrganizationStatus.ACTIVE,
    isActive: true,
  };

  const hugoOrganization = existingHugoOrganization
    ? await prisma.organization.update({
        where: { id: existingHugoOrganization.id },
        data: hugoOrganizationData,
      })
    : await prisma.organization.create({ data: hugoOrganizationData });

  await prisma.organizationUser.upsert({
    where: {
      organizationId_userId: {
        organizationId: hugoOrganization.id,
        userId: hugoUser.id,
      },
    },
    update: {
      role: OrganizationRole.ORG_ADMIN,
      isActive: true,
    },
    create: {
      organizationId: hugoOrganization.id,
      userId: hugoUser.id,
      role: OrganizationRole.ORG_ADMIN,
      isActive: true,
    },
  });

  const existingHugoEntity = await prisma.entity.findFirst({
    where: {
      organizationId: hugoOrganization.id,
      name: HUGO_ENTITY_NAME,
    },
  });

  const hugoEntityData = {
    organizationId: hugoOrganization.id,
    name: HUGO_ENTITY_NAME,
    legalName: HUGO_ENTITY_NAME,
    type: EntityType.COMPANY,
    country: 'LU',
    baseCurrency: 'EUR',
    accountingStandard: AccountingStandard.LUX_GAAP,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    isActive: true,
  };

  const hugoEntity = existingHugoEntity
    ? await prisma.entity.update({
        where: { id: existingHugoEntity.id },
        data: hugoEntityData,
      })
    : await prisma.entity.create({ data: hugoEntityData });

  await prisma.entityUser.upsert({
    where: {
      entityId_userId: {
        entityId: hugoEntity.id,
        userId: hugoUser.id,
      },
    },
    update: {
      role: EntityRole.ENTITY_ADMIN,
      isActive: true,
    },
    create: {
      entityId: hugoEntity.id,
      userId: hugoUser.id,
      role: EntityRole.ENTITY_ADMIN,
      isActive: true,
    },
  });

  const existingOrganization = await prisma.organization.findFirst({
    where: { name: ORGANIZATION_NAME },
  });

  const organizationData = {
    name: ORGANIZATION_NAME,
    legalName: ORGANIZATION_NAME,
    type: OrganizationType.ASSET_MANAGER,
    country: 'LU',
    baseCurrency: 'EUR',
    isActive: true,
  };

  const organization = existingOrganization
    ? await prisma.organization.update({
        where: { id: existingOrganization.id },
        data: organizationData,
      })
    : await prisma.organization.create({ data: organizationData });

  await prisma.organizationUser.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: admin.id,
      },
    },
    update: {
      role: OrganizationRole.ORG_ADMIN,
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      userId: admin.id,
      role: OrganizationRole.ORG_ADMIN,
      isActive: true,
    },
  });

  const existingEntity = await prisma.entity.findFirst({
    where: {
      organizationId: organization.id,
      name: ENTITY_NAME,
    },
  });

  const entityData = {
    organizationId: organization.id,
    name: ENTITY_NAME,
    legalName: ENTITY_NAME,
    type: EntityType.COMPANY,
    country: 'LU',
    baseCurrency: 'EUR',
    accountingStandard: AccountingStandard.LUX_GAAP,
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    isActive: true,
  };

  const entity = existingEntity
    ? await prisma.entity.update({
        where: { id: existingEntity.id },
        data: entityData,
      })
    : await prisma.entity.create({ data: entityData });

  await prisma.entityUser.upsert({
    where: {
      entityId_userId: {
        entityId: entity.id,
        userId: admin.id,
      },
    },
    update: {
      role: EntityRole.ENTITY_ADMIN,
      isActive: true,
    },
    create: {
      entityId: entity.id,
      userId: admin.id,
      role: EntityRole.ENTITY_ADMIN,
      isActive: true,
    },
  });

  const accountIds = new Map<string, string>();

  for (const account of accounts) {
    const seededAccount = await prisma.chartOfAccount.upsert({
      where: {
        entityId_code: {
          entityId: entity.id,
          code: account.code,
        },
      },
      update: {
        ...account,
        jurisdiction: 'LU',
        standard: AccountingStandard.LUX_GAAP,
        isSystem: true,
        isActive: true,
      },
      create: {
        entityId: entity.id,
        ...account,
        jurisdiction: 'LU',
        standard: AccountingStandard.LUX_GAAP,
        isSystem: true,
        isActive: true,
      },
    });

    accountIds.set(account.code, seededAccount.id);
  }

  for (const rule of rules) {
    const debitAccountId = accountIds.get(rule.debitAccountCode);
    const creditAccountId = accountIds.get(rule.creditAccountCode);

    if (!debitAccountId || !creditAccountId) {
      throw new Error(`Missing chart account for ${rule.transactionType}`);
    }

    const existingRule = await prisma.accountingRule.findFirst({
      where: {
        entityId: entity.id,
        transactionType: rule.transactionType,
      },
    });

    const ruleData = {
      entityId: entity.id,
      transactionType: rule.transactionType,
      debitAccountId,
      creditAccountId,
      descriptionTemplate: rule.descriptionTemplate,
      priority: 100,
      isActive: true,
    };

    if (existingRule) {
      await prisma.accountingRule.update({
        where: { id: existingRule.id },
        data: ruleData,
      });
    } else {
      await prisma.accountingRule.create({ data: ruleData });
    }
  }

  const existingTemplate = await prisma.accountingTemplate.findFirst({
    where: {
      name: TEMPLATE_NAME,
      version: TEMPLATE_VERSION,
      jurisdiction: 'LU',
      standard: AccountingStandard.LUX_GAAP,
    },
  });

  const templateData = {
    name: TEMPLATE_NAME,
    version: TEMPLATE_VERSION,
    jurisdiction: 'LU',
    standard: AccountingStandard.LUX_GAAP,
    description:
      'Starter operational template for Luxembourg entities. This is not the full PCN.',
    isSystem: true,
    isActive: true,
  };

  const template = existingTemplate
    ? await prisma.accountingTemplate.update({
        where: { id: existingTemplate.id },
        data: templateData,
      })
    : await prisma.accountingTemplate.create({ data: templateData });

  for (const account of accounts) {
    await prisma.accountingTemplateAccount.upsert({
      where: {
        templateId_code: {
          templateId: template.id,
          code: account.code,
        },
      },
      update: {
        ...account,
        isActive: true,
      },
      create: {
        templateId: template.id,
        ...account,
        isActive: true,
      },
    });
  }

  for (const rule of rules) {
    const existingTemplateRule = await prisma.accountingTemplateRule.findFirst({
      where: {
        templateId: template.id,
        transactionType: rule.transactionType,
        debitAccountCode: rule.debitAccountCode,
        creditAccountCode: rule.creditAccountCode,
      },
    });

    const templateRuleData = {
      templateId: template.id,
      transactionType: rule.transactionType,
      debitAccountCode: rule.debitAccountCode,
      creditAccountCode: rule.creditAccountCode,
      descriptionTemplate: rule.descriptionTemplate,
      priority: 100,
      isActive: true,
    };

    if (existingTemplateRule) {
      await prisma.accountingTemplateRule.update({
        where: { id: existingTemplateRule.id },
        data: templateRuleData,
      });
    } else {
      await prisma.accountingTemplateRule.create({ data: templateRuleData });
    }
  }

  const year = new Date().getUTCFullYear();
  const periodName = 'Current fiscal year';
  const existingPeriod = await prisma.accountingPeriod.findFirst({
    where: {
      entityId: entity.id,
      name: periodName,
    },
  });

  const periodData = {
    entityId: entity.id,
    name: periodName,
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    status: 'OPEN' as const,
    closedAt: null,
  };

  if (existingPeriod) {
    await prisma.accountingPeriod.update({
      where: { id: existingPeriod.id },
      data: periodData,
    });
  } else {
    await prisma.accountingPeriod.create({ data: periodData });
  }

  console.log(
    `Seeded ${ADMIN_EMAIL}, ${HUGO_EMAIL}, ${HUGO_ORGANIZATION_NAME}, ${HUGO_ENTITY_NAME}, ${ORGANIZATION_NAME}, ${ENTITY_NAME}, and ${TEMPLATE_NAME}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
