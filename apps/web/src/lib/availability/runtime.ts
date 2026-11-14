import "server-only";
import { prisma } from "../prisma";
import { createAvailabilityService } from "./service";
export const availabilityService = createAvailabilityService(prisma);
