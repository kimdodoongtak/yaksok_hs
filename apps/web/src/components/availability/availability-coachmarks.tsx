"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./availability-coachmarks.module.css";

const guideSeenKey = "yaksok:availability-guide:v1";

function hasSeenGuide() {
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      if (window[storage].getItem(guideSeenKey) === "seen") return true;
    } catch { /* 저장소 접근이 제한되면 다음 저장소를 확인한다. */ }
  }
  return false;
}

function rememberGuide() {
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storage].setItem(guideSeenKey, "seen");
      return;
    } catch { /* 영구 저장이 제한되면 현재 브라우저 세션에 기억한다. */ }
  }
}

const welcome = {
  target: "welcome",
  title: "가능한 시간을 알려주세요",
  description: "시간 선택부터 제출까지, 사용법을 짧게 안내해 드릴게요.",
};

const steps = [
  {
    target: "mode",
    title: "‘선택’으로 바꿔 주세요",
    description: "시간을 칠할 땐 ‘선택’, 화면을 움직일 땐 ‘스크롤’을 눌러요.",
  },
  {
    target: "grid",
    title: "가능한 시간을 칠해 주세요",
    description: "누르거나 쓸어서 여러 칸을 골라요. 칠한 칸을 다시 누르면 지워져요.",
  },
  {
    target: "unit",
    title: "선택할 시간 단위를 정해요",
    description: "30분·1시간씩 고르거나, ‘날짜’로 하루의 시간을 한 번에 선택해요.",
  },
  {
    target: "repeat",
    title: "다음 주도 같은 시간이라면",
    description: "‘주간 반복’에서 이번 주의 선택을 다른 주에도 적용할 수 있어요.",
  },
  {
    target: "submit",
    title: "마지막으로 ‘선택 제출’",
    description: "제출해야 다른 사람에게 반영돼요. 시간을 수정한 뒤에도 다시 제출해 주세요.",
  },
] as const;

export function AvailabilityCoachmarks({ enabled, request }: {
  enabled: boolean;
  request: number;
}) {
  const [step, setStep] = useState<number | null>(null);
  const autoChecked = useRef(false);
  const lastRequest = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(() => {
      const replay = request !== lastRequest.current;
      lastRequest.current = request;
      if (replay) {
        autoChecked.current = true;
        setStep(0);
        return;
      }
      if (autoChecked.current) return;
      autoChecked.current = true;
      if (!hasSeenGuide()) setStep(-1);
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, request]);

  function dismiss() {
    rememberGuide();
    setStep(null);
  }

  return enabled && step !== null
    ? <CoachmarkDialog step={step} onStep={setStep} onDismiss={dismiss} />
    : null;
}

type Placement = {
  left: number;
  top: number;
  width: number;
  arrow: { left: number; top: number } | null;
  spotlight: { left: number; top: number; width: number; height: number } | null;
};

function CoachmarkDialog({ step, onStep, onDismiss }: {
  step: number;
  onStep: (step: number) => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const maskId = useId();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const isWelcome = step === -1;
  const content = isWelcome ? welcome : steps[step];

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-coachmark="${content.target}"]`);
    const panel = card.current;
    if ((!target && !isWelcome) || !panel) return;
    // Reveal the actual target before positioning its explanation. A modal blocks
    // user scrolling, but the document can still be moved programmatically.
    if (target) {
      const bounds = target.getBoundingClientRect();
      const controls = document.querySelector<HTMLElement>("[data-calendar-controls]");
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      if (content.target === "grid" && controls) {
        const controlsBounds = controls.getBoundingClientRect();
        const footerTop = document.querySelector('[data-coachmark="submit"]')?.closest("footer")?.getBoundingClientRect().top ?? viewportHeight;
        const visibleHeight = Math.min(bounds.bottom, footerTop, viewportHeight - 16) - Math.max(bounds.top, controlsBounds.bottom);
        if (visibleHeight < 126) {
          const stickyTop = Number.parseFloat(getComputedStyle(controls).top) || 0;
          window.scrollBy({ top: bounds.top - stickyTop - controlsBounds.height - 8, behavior: "instant" });
        }
      } else if (bounds.top < 16 || bounds.bottom > viewportHeight - 16) {
        target.scrollIntoView({ block: "center", behavior: "instant" });
      }
    }
    const measure = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const cardWidth = Math.min(isWelcome ? 320 : width < 360 ? 240 : 260, width - 32);
      panel.style.width = `${cardWidth}px`;
      const cardHeight = panel.getBoundingClientRect().height;
      if (isWelcome) {
        setPlacement({ left: offsetLeft + (width - cardWidth) / 2, top: offsetTop + Math.max(16, (height - cardHeight) / 2), width: cardWidth, arrow: null, spotlight: null });
        return;
      }
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      const bottom = offsetTop + height - 16;
      const alignRight = content.target === "unit" || content.target === "submit" || content.target === "grid";
      const desiredLeft = alignRight ? bounds.right - cardWidth : bounds.left;
      const left = Math.max(offsetLeft + 16, Math.min(desiredLeft, offsetLeft + width - cardWidth - 16));
      // Only spotlight visible time rows below the sticky calendar headings.
      const controlsBottom = document.querySelector("[data-calendar-controls]")?.getBoundingClientRect().bottom ?? 0;
      const targetTop = Math.max(offsetTop + 8, bounds.top - 6, content.target === "grid" ? controlsBottom + 4 : 0);
      const footerTop = document.querySelector('[data-coachmark="submit"]')?.closest("footer")?.getBoundingClientRect().top ?? bottom;
      const targetBottom = Math.min(bottom, bounds.bottom + 6, content.target === "grid" ? Math.min(targetTop + 126, footerTop - 8) : Infinity);
      const below = targetBottom + 18;
      const above = targetTop - cardHeight - 18;
      const preferAbove = content.target === "repeat" || content.target === "submit";
      const top = preferAbove && above >= offsetTop + 16 ? above : below + cardHeight <= bottom ? below : above >= offsetTop + 16 ? above : Math.max(offsetTop + 16, bottom - cardHeight);
      const spotTop = Math.max(targetTop, top < targetTop ? top + cardHeight + 12 : targetTop);
      const spotBottom = Math.min(targetBottom, top >= targetTop ? top - 12 : targetBottom);
      const spotLeft = Math.max(offsetLeft + 8, bounds.left - 6);
      const spotRight = Math.min(offsetLeft + width - 8, bounds.right + 6);
      const hasSpotlight = spotBottom > spotTop && spotRight > spotLeft;
      const arrowLeft = Math.max(left + 22, Math.min((spotLeft + spotRight) / 2, left + cardWidth - 22));
      const arrowTop = top >= spotBottom ? top : top + cardHeight;
      setPlacement({ left, top, width: cardWidth, arrow: hasSpotlight ? { left: arrowLeft - 6, top: arrowTop - 6 } : null, spotlight: hasSpotlight
        ? { left: spotLeft, top: spotTop, width: spotRight - spotLeft, height: spotBottom - spotTop }
        : null });
    };
    measure();
    const focusFrame = requestAnimationFrame(() => nextButton.current?.focus({ preventScroll: true }));
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    if (target) observer.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [content.target, isWelcome]);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="calendar-guide-title" aria-describedby="calendar-guide-description"
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <svg className={styles.backdrop} width="100%" height="100%" aria-hidden="true">
      <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
        <rect width="100%" height="100%" fill="white" />
        {placement?.spotlight && <rect x={placement.spotlight.left} y={placement.spotlight.top} width={placement.spotlight.width} height={placement.spotlight.height} rx="12" fill="black" />}
      </mask></defs>
      <rect width="100%" height="100%" fill="#182237" fillOpacity="0.66" mask={`url(#${maskId})`} />
      {placement?.spotlight && <rect x={placement.spotlight.left} y={placement.spotlight.top} width={placement.spotlight.width} height={placement.spotlight.height} rx="12" fill="none" stroke="white" strokeWidth="3" />}
    </svg>
    {placement?.arrow && <div className={styles.arrow} style={placement.arrow} aria-hidden="true" />}
    <div ref={card} className={`${styles.card} ${isWelcome ? styles.welcome : ""}`} style={placement ? { left: placement.left, top: placement.top, width: placement.width } : { visibility: "hidden" }}>
      {isWelcome ? <div className={styles.welcomeIcon} aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/></svg></div>
        : <div className={styles.eyebrow}><span>사용법</span><span>{step + 1} / {steps.length}</span></div>}
      <div aria-live="polite" aria-atomic="true">
        <h2 id="calendar-guide-title">{content.title}</h2>
        <p id="calendar-guide-description">{content.description}</p>
      </div>
      {isWelcome ? <div className={styles.welcomeActions}>
        <button ref={nextButton} type="button" className={styles.next} onClick={() => onStep(0)}>사용법 보기</button>
        <button type="button" className={styles.welcomeSkip} onClick={onDismiss}>바로 시작하기</button>
      </div> : <div className={styles.actions}>
        <button type="button" className={styles.skip} onClick={onDismiss}>건너뛰기</button>
        <div>
          {step > 0 && <button type="button" className={styles.previous} onClick={() => onStep(step - 1)}>이전</button>}
          <button ref={nextButton} type="button" className={styles.next} onClick={() => step === steps.length - 1 ? onDismiss() : onStep(step + 1)}>{step === steps.length - 1 ? "시작하기" : "다음"}</button>
        </div>
      </div>}
    </div>
  </dialog>;
}
