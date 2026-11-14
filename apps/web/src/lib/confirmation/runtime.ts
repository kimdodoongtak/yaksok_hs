import "server-only";
import { prisma } from "../prisma";
import { createConfirmationService } from "./service";
export const confirmationService=createConfirmationService(prisma);
