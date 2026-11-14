import "server-only";
import type { Prisma } from "../../generated/prisma/client";
// 호출자가 약속 잠금·권한을 확인한 같은 트랜잭션 안에서 실행한다.
export async function cancelPromiseInTransaction(tx: Prisma.TransactionClient, promiseId: string, at: Date) {
  await tx.promiseRecord.update({ where: { id: promiseId }, data: { status: "cancelled", cancelledAt: at } });
  await tx.participantSession.updateMany({ where: { participant: { promiseId } }, data: { expiresAt: at } });
}
