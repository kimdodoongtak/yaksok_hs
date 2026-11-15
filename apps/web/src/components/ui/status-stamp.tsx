export function StatusStamp({ kind }: { kind: "cancelled" | "expired" | "invalid" | "left" | "confirmed" }) {
  const content = {cancelled:["운행취소","CANCELLED"],expired:["운행종료","EXPIRED"],invalid:["노선없음","NO ROUTE"],left:["하차","CHECKED OUT"],confirmed:["확정","CONFIRMED"]}[kind];
  return <div className="status-stamp" data-kind={kind} aria-hidden="true"><span>YAKSOK LINE</span><strong>{content[0]}</strong><small>{content[1]}</small></div>;
}
