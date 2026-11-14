import "server-only";
import { prisma } from "../prisma";
import { createParticipantManagementService } from "./service";
export const participantManagementService = createParticipantManagementService(prisma);
