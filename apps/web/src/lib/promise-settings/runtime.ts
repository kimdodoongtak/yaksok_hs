import "server-only";
import { prisma } from "../prisma";
import { createPromiseSettingsService } from "./service";

export const promiseSettingsService = createPromiseSettingsService(prisma);
