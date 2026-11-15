"use client";

import { useEffect, useState } from "react";
import { deadlineRemaining } from "./deadline-remaining";
import styles from "./availability.module.css";

export function DeadlineCountdown({ deadline, serverNow, closed }: {
  deadline: string;
  serverNow: string;
  closed: boolean;
}) {
  const [tick, setTick] = useState({ serverNow, elapsed: 0 });
  useEffect(() => {
    if (closed) return;
    // 기기 시계 오차를 피하고, 조회 실패 중에도 마지막 서버 시각부터 시간을 센다.
    const started = performance.now();
    const timer = window.setInterval(() => {
      setTick({ serverNow, elapsed: performance.now() - started });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [serverNow, closed]);
  const elapsed = tick.serverNow === serverNow ? tick.elapsed : 0;
  const remaining = closed ? 0 : Date.parse(deadline) - Date.parse(serverNow) - elapsed;
  const ended = remaining <= 0;

  return (
    <div role="timer" aria-label="응답 마감까지 남은 시간" aria-live="off"
      className={styles.deadlineCountdown} data-closed={ended}>
      {!ended && <span>응답 마감까지</span>}
      <strong>{deadlineRemaining(remaining)}</strong>
    </div>
  );
}
