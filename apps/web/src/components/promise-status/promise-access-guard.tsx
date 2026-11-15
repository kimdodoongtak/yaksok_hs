"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityResult } from "@/lib/availability/view";
// 편집 중인 설정은 유지하면서 취소·인증 만료를 감지하면 상세 화면을 닫는다.
export function PromiseAccessGuard({ inviteToken, participantId, children }: { inviteToken: string; participantId: string; children: ReactNode }) {
  const router = useRouter();
  const [terminal, setTerminal] = useState<string | null>(null), [offline, setOffline] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let reading = false, ended = false;
    async function refresh() {
      if (reading || ended || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const response = await fetch(`/p/${inviteToken}/availability/state`, { cache: "no-store", signal: controller.signal });
        const result: AvailabilityResult = await response.json();
        if (controller.signal.aborted) return;
        if (!result.ok && result.code === "UNAVAILABLE") { setOffline(true); return; }
        if (!result.ok || result.snapshot.participantId !== participantId) {
          ended = true; setTerminal(result.ok ? "UNAUTHORIZED" : result.code);
          router.replace(`/p/${inviteToken}`); return;
        }
        setOffline(false);
      } catch { if (!controller.signal.aborted) setOffline(true); }
      finally { reading = false; }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    const visible = () => void refresh();
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [inviteToken, participantId, router]);
  if (terminal) return <main className="grid min-h-dvh place-items-center bg-[#f4f1ea] p-6"><h1 className="text-xl font-bold">{terminal === "PROMISE_CANCELLED" ? "취소된 약속입니다." : terminal === "LINK_EXPIRED" ? "만료된 약속입니다" : "약속 상태를 확인하고 있어요."}</h1></main>;
  return <>{offline && <p role="status" className="bg-[#fce4e0] px-4 py-3 text-sm text-[#cc201b]">최신 상태를 확인하지 못했어요. 연결되면 다시 확인할게요.</p>}{children}</>;
}
