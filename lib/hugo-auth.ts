import type { AuthenticatedNextApiRequest } from "./auth";
import { prisma } from "./prisma";

export interface HugoUserContext {
  userId: string;
}

export interface HugoCabinetContext extends HugoUserContext {
  cabinetId: string;
  organizationId: string;
  cabinetName: string;
}

export const getHugoUser = (
  req: AuthenticatedNextApiRequest
): HugoUserContext | null => {
  return req.user?.id ? { userId: req.user.id } : null;
};

export const getHugoCabinet = async (
  req: AuthenticatedNextApiRequest
): Promise<HugoCabinetContext | null> => {
  const user = getHugoUser(req);

  if (!user) {
    return null;
  }

  const membership = await prisma.entityUser.findFirst({
    where: {
      userId: user.userId,
      isActive: true,
      entity: {
        isActive: true,
        organization: {
          isActive: true,
          status: "ACTIVE",
        },
      },
    },
    select: {
      entity: {
        select: {
          id: true,
          name: true,
          organizationId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return null;
  }

  return {
    userId: user.userId,
    cabinetId: membership.entity.id,
    organizationId: membership.entity.organizationId,
    cabinetName: membership.entity.name,
  };
};

export const requireHugoCabinet = async (
  req: AuthenticatedNextApiRequest
): Promise<HugoCabinetContext | null> => {
  return getHugoCabinet(req);
};
