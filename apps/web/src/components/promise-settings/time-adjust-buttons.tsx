import styles from "./settings.module.css";

export function TimeAdjustButtons({ label, value, min, max, onAdjust }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className={styles.timeArrows}>
      {([30, -30] as const).map((delta) => (
        <button
          key={delta}
          type="button"
          aria-label={`${label} 30분 ${delta > 0 ? "늘리기" : "줄이기"}`}
          disabled={delta > 0 ? value >= max : value <= min}
          onClick={() => onAdjust(delta)}
          className={styles.timeArrow}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={delta > 0 ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
          </svg>
        </button>
      ))}
    </div>
  );
}
