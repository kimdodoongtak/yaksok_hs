import type { PromiseSettingsDefaults } from "@/lib/promise-settings/policy";
import styles from "./settings.module.css";

export function InvitationTicket({ settings, animate }: {
  settings: Pick<PromiseSettingsDefaults, "dateRangeStart" | "dateRangeEnd" | "dailyStart" | "dailyEnd" | "durationMinutes">;
  animate: boolean;
}) {
  const hours = Math.floor(Number(settings.durationMinutes) / 60);
  const minutes = Number(settings.durationMinutes) % 60;
  const duration = [hours ? `${hours}시간` : "", minutes ? `${minutes}분` : ""].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="invitation-ticket-title" className={styles.ticketSection}>
      <div className={styles.ticket}>
        <div className={styles.ticketBody}>
          <header className={styles.ticketHeader}>
            <h2 id="invitation-ticket-title">초대 티켓</h2>
            <span className={styles.ticketBadge}>모집 중</span>
          </header>
          <div className={styles.ticketDates}>
            <div>
              <p className={styles.ticketLabel}>가능한 시작일</p>
              <time dateTime={settings.dateRangeStart}>
                <span className={styles.ticketYear}>{settings.dateRangeStart.slice(0, 4)}</span>
                <strong className={styles.ticketDate}>{settings.dateRangeStart.slice(5).replace("-", ".")}</strong>
              </time>
            </div>
            <span aria-hidden="true" className={styles.ticketRoute}>
              <span />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12h16m-5-5 5 5-5 5" /></svg>
              <span />
            </span>
            <div>
              <p className={styles.ticketLabel}>가능한 종료일</p>
              <time dateTime={settings.dateRangeEnd}>
                <span className={styles.ticketYear}>{settings.dateRangeEnd.slice(0, 4)}</span>
                <strong className={styles.ticketDate}>{settings.dateRangeEnd.slice(5).replace("-", ".")}</strong>
              </time>
            </div>
          </div>
          <dl className={styles.ticketDetails}>
            <div>
              <dt className={styles.ticketLabel}>하루 시간 범위</dt>
              <dd>{settings.dailyStart}–{settings.dailyEnd}</dd>
            </div>
            <div>
              <dt className={styles.ticketLabel}>소요 시간</dt>
              <dd>{duration}</dd>
            </div>
          </dl>
          <div className={styles.ticketFooter}>
            <p className={styles.ticketNote}>우리의 다음 만남을<br />기다리며.</p>
            <p className={`${styles.ticketStamp} ${animate ? styles.stampEnter : ""}`}>초대 준비 완료</p>
          </div>
        </div>
        <div aria-hidden="true" className={styles.ticketStub}>
          <span className={styles.ticketStubText}>SEE YOU SOON</span>
          <span className={styles.ticketBarcode} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></svg>
        </div>
        <span aria-hidden="true" className={`${styles.ticketCorner} ${styles.ticketTopLeft}`} />
        <span aria-hidden="true" className={`${styles.ticketCorner} ${styles.ticketTopRight}`} />
        <span aria-hidden="true" className={`${styles.ticketCorner} ${styles.ticketBottomLeft}`} />
        <span aria-hidden="true" className={`${styles.ticketCorner} ${styles.ticketBottomRight}`} />
      </div>
      <p className={styles.ticketHelp}>친구들의 응답을 모아 만날 시간을 정해요.</p>
    </section>
  );
}
