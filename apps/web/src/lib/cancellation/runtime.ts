import "server-only";
import { prisma } from "../prisma";
import { createCancellationService } from "./service";
export const cancellationService = createCancellationService(prisma);
