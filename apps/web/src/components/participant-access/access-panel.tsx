"use client";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { changeParticipantPin, joinPromise, loginParticipant, logoutParticipant, type AccessFormState } from "@/actions/participant-access";
import type { ParticipantView } from "@/lib/participant-access/view";
import styles from "./access.module.css";
import actionStyles from "@/components/ui/invitation-actions.module.css";
const initial: AccessFormState = { message: null, revision: 0 };
function Feedback({ state }: { state: AccessFormState }) {
  return state.message ? <div role="alert" className={styles.error}>
    <p>{state.message}</p>
    {state.retryAt && <p className="mt-2">다시 시도할 수 있는 시각: <time dateTime={state.retryAt}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(state.retryAt))}</time></p>}
  </div> : null;
}
function PinField({ label, name, fresh = false }: { label: string; name: string; fresh?: boolean }) {
  const id = useId();
  return <div><label htmlFor={id}>{label}</label><input id={id} name={name} type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required autoComplete={fresh ? "new-password" : "current-password"} placeholder="숫자 4자리" /></div>;
}
function CredentialsForm({ inviteToken, login }: { inviteToken: string; login: boolean }) {
  const id = useId();
  const [nickname, setNickname] = useState("");
  const [state, action, pending] = useActionState((login ? loginParticipant : joinPromise).bind(null, inviteToken), initial);
  return <form action={action} className={styles.form} aria-busy={pending}>
    <div><label htmlFor={id}>닉네임</label><input id={id} name="nickname" value={nickname} onChange={event => setNickname(event.target.value)} required autoComplete="username" maxLength={128} aria-describedby={`${id}-help`} placeholder="닉네임 입력" /><p id={`${id}-help`} className={styles.help}>이모지 없이 2~12자</p></div>
    <PinField key={state.revision} label="PIN" name="pin" fresh={!login} />
    <Feedback state={state} />
    <button className={styles.primary} disabled={pending}>{pending ? "확인 중…" : login ? "로그인하기" : "약속에 참여하기"}</button>
    <p className={styles.help}>{login ? "등록할 때 사용한 닉네임과 PIN을 입력해 주세요." : "재로그인에 사용할 닉네임과 PIN을 기억해 주세요."}</p>
  </form>;
}
export function ParticipantControls({ inviteToken }: { inviteToken: string }) {
  const [changing, setChanging] = useState(false);
  const [changeState, changeAction, changingPin] = useActionState(changeParticipantPin.bind(null, inviteToken), initial);
  const [logoutState, logoutAction, loggingOut] = useActionState(logoutParticipant.bind(null, inviteToken), initial);
  return <div className={styles.controls}>
    <div className={styles.controlRow}>
      <button type="button" onClick={() => setChanging(!changing)} aria-expanded={changing}>PIN 변경</button>
      <form action={logoutAction}><button disabled={loggingOut || changingPin}>{loggingOut ? "로그아웃 중…" : "로그아웃"}</button></form>
    </div>
    <Feedback state={logoutState} />
    {changing && <form action={changeAction} className={styles.form} aria-busy={changingPin}>
      <p className={styles.help}>변경하면 모든 기기에서 로그아웃돼요. 새 PIN으로 다시 로그인해 주세요.</p>
      <PinField key={`current-${changeState.revision}`} label="현재 PIN" name="currentPin" />
      <PinField key={`new-${changeState.revision}`} label="새 PIN" name="newPin" fresh />
      <Feedback state={changeState} />
      <button className={styles.primary} disabled={changingPin || loggingOut}>{changingPin ? "변경 중…" : "PIN 변경하기"}</button>
    </form>}
  </div>;
}
export function AccessPanel({ inviteToken, view, pinChanged = false, hostTicket = false }: { inviteToken: string; view: ParticipantView; pinChanged?: boolean; hostTicket?: boolean }) {
  const [mode, setMode] = useState<"join" | "login">(pinChanged || (view.kind === "anonymous" && view.registration !== "open") ? "login" : "join");
  if (view.kind === "participant") return <div className={styles.panel}>
    {!hostTicket && <>
      <h1>참여 정보</h1>
      <p className={styles.description}>{view.status === "collecting" ? "참여가 완료됐습니다." : view.status === "confirmed" ? "약속이 확정됐어요." : "참여 모집이 마감됐어요."}</p>
      <div className={styles.memberCard}><span>{view.role === "host" ? "방장" : "참여자"}</span><strong>{view.nickname}</strong><span className={styles.badge}>참여 완료</span></div>
    </>}
    <Link href={`/p/${inviteToken}/${view.status === "confirmed" ? "result" : view.status === "closed" ? "candidates" : "availability"}`} className={`${actionStyles.action} ${actionStyles.primary} mt-4`}>{view.status === "collecting" ? "가능 시간 입력" : view.status === "confirmed" ? "확정 결과 보기" : "시간 후보 보기"}</Link>
    <Link href={`/p/${inviteToken}/participants`} className="mt-3 block py-3 text-center text-sm text-[#e92520]">{view.role === "host" ? "참여자 관리" : "참여자 · 나가기"}</Link>
    <ParticipantControls inviteToken={inviteToken} />
  </div>;
  const activeMode = view.registration === "open" ? mode : "login";
  const notices = { full: "정원이 가득 찼어요. 기존 참여자는 로그인할 수 있어요.", closed: "참여 모집이 마감됐어요. 기존 참여자는 로그인할 수 있어요.", draft: "방장이 약속을 준비하고 있어요. 방장은 다시 로그인할 수 있어요.", open: "참여할 닉네임과 PIN을 입력해 주세요." };
  return <div className={styles.panel}>
    <h1>{view.registration === "draft" ? "방장이 약속을 준비하고 있어요" : "약속 참여"}</h1>
    <p className={styles.description}>{notices[view.registration]}</p>
    {pinChanged && <p role="status" className={styles.notice}>PIN을 변경했어요. 새 PIN으로 다시 로그인해 주세요.</p>}
    <div className={styles.modes} aria-label="참여 방법">
      {view.registration === "open" && <button type="button" aria-pressed={activeMode === "join"} onClick={() => setMode("join")}>처음 참여</button>}
      <button type="button" aria-pressed={activeMode === "login"} onClick={() => setMode("login")}>다시 로그인</button>
    </div>
    <CredentialsForm key={activeMode} inviteToken={inviteToken} login={activeMode === "login"} />
  </div>;
}
