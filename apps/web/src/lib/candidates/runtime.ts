import "server-only";
import { prisma } from "../prisma";
import { createCandidatesService } from "./service";
export const candidatesService = createCandidatesService(prisma);
