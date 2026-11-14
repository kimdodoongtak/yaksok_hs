import "server-only";
import { prisma } from "../prisma";
import { createReschedulingService } from "./service";
export const reschedulingService=createReschedulingService(prisma);
