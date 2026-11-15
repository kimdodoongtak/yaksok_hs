// 장식용 바코드. 인증 토큰이나 개인정보를 담지 않는다.
export function TicketBarcode(){
  const bars=[2,1,3,1,1,2,4,1,2,1,3,2,1,1,4,2,1,3,1,2,2,1,4,1,3,1,2,1,1,3,2,4,1,2,1,3,1,2,4,1,2,1,3,2,1,4,1,2];
  let x=0;
  return <svg viewBox="0 0 155 26" preserveAspectRatio="none" aria-hidden="true" focusable="false">{bars.map((width,index)=>{const left=x;x+=width+1.2;return <rect key={index} x={left} y="0" width={width} height="26" fill="currentColor"/>;})}</svg>;
}
// 장식용 원형 도장. 확정 상태는 서버 조회 결과로만 결정한다.
export function ConfirmedStamp(){
  return <svg viewBox="0 0 132 132" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor"><circle cx="66" cy="66" r="59" strokeWidth="2.7"/><circle cx="66" cy="66" r="55" strokeWidth="1.15"/><circle cx="66" cy="66" r="60.7" strokeWidth=".55" strokeDasharray="31 1.8 8 2.2 49 1.2"/></g>
    <g fill="currentColor" textAnchor="middle" fontWeight="700"><text x="66" y="43" fontSize="7" letterSpacing="1.7">YAKSOK LINE</text><text x="66" y="80" fontSize="29">확정</text><text x="66" y="97" fontSize="7" letterSpacing="1">CONFIRMED</text></g>
  </svg>;
}
