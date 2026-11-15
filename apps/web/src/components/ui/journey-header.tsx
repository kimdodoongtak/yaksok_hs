import Link from "next/link";
const stages = ["발권", "모집", "마감", "확정"];
export function JourneyHeader({ stage, href = "/" }: { stage?: number; href?: string | null }) {
  const brand = <><span className="brand-signal" aria-hidden="true"><i/><i/><i/></span>약속행</>;
  return <header className="journey-header">
    {href ? <Link className="brand" href={href} aria-label="약속 잡기">{brand}</Link> : <span className="brand" aria-hidden="true">{brand}</span>}
    {stage !== undefined && <JourneyProgress stage={stage}/>}
  </header>;
}

export function JourneyProgress({ stage }: { stage: number }) {
  return <ol className="journey-stages" aria-label="약속 진행 상태">{stages.map((label, index) => <li key={label} data-reached={index <= stage} aria-current={index === stage ? "step" : undefined}><span aria-hidden="true"/>{label}</li>)}</ol>;
}
