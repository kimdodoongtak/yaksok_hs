import "server-only";
import { prisma } from "../prisma";
import { createInvitationService } from "./service";
export const invitationService = createInvitationService(prisma);
