import type { NextApiResponse } from "next";
import { jsonError, jsonSuccess } from "../../../lib/accounting-api";
import { AuthenticatedNextApiRequest, withAuth } from "../../../lib/auth";
import { requireHugoCabinet } from "../../../lib/hugo-auth";

const getCabinet = async (
  req: AuthenticatedNextApiRequest,
  res: NextApiResponse
) => {
  const cabinet = await requireHugoCabinet(req);

  if (!cabinet) {
    return jsonError(res, 404, "Cabinet not found");
  }

  return jsonSuccess(res, {
    cabinetId: cabinet.cabinetId,
    name: cabinet.cabinetName,
    organizationId: cabinet.organizationId,
  });
};

export default withAuth(
  async (req: AuthenticatedNextApiRequest, res: NextApiResponse) => {
    try {
      if (req.method === "GET") {
        return await getCabinet(req, res);
      }

      return jsonError(res, 405, "Method not allowed");
    } catch (error) {
      console.error("HUGO CABINET ERROR:", error);
      return jsonError(res, 500, "Internal server error");
    }
  }
);
