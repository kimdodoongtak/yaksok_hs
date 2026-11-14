// 장식용 바코드. 인증 토큰이나 개인정보를 담지 않는다.
export function TicketBarcode(){
  const bars=[2,1,3,1,1,2,4,1,2,1,3,2,1,1,4,2,1,3,1,2,2,1,4,1,3,1,2,1,1,3,2,4,1,2,1,3,1,2,4,1,2,1,3,2,1,4,1,2];
  let x=0;
  return <svg viewBox="0 0 155 26" preserveAspectRatio="none" aria-hidden="true" focusable="false">{bars.map((width,index)=>{const left=x;x+=width+1.2;return <rect key={index} x={left} y="0" width={width} height="26" fill="currentColor"/>;})}</svg>;
}
import { useId } from "react";

// 장식용 고무도장. 확정 여부는 서버에서 조회한 결과로만 결정한다.
export function ConfirmedStamp(){
  const id=useId();
  return <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <path id={`${id}-top`} d="M 20,60 A 40,40 0 0,1 100,60"/>
      <path id={`${id}-bottom`} d="M 13,60 A 47,47 0 0,0 107,60"/>
      <mask id={`${id}-ink`}>
        <rect width="120" height="120" fill="white"/>
        <path d="m12 37 19 2m47-25 3 8M7 76l16-3m64 27 17-5M39 49l14 2m8 16 21-4m-37 14 13 2m10 6 5-3" stroke="black" strokeWidth=".8" opacity=".65"/>
        <g fill="black" opacity=".6"><circle cx="54" cy="58" r="1"/><circle cx="76" cy="73" r="1.3"/><circle cx="36" cy="88" r=".8"/><circle cx="97" cy="42" r="1"/><circle cx="63" cy="18" r=".8"/></g>
      </mask>
    </defs>
    <g fill="none" stroke="currentColor" mask={`url(#${id}-ink)`}>
      <circle cx="60" cy="60" r="56" strokeWidth="2.2"/>
      <circle cx="60" cy="60" r="52.5" strokeWidth=".9"/>
      <circle cx="60" cy="60" r="35" strokeWidth="1.6"/>
      <circle cx="60" cy="60" r="32" strokeWidth=".7"/>
      <g fill="currentColor" stroke="none" fontFamily="Arial, sans-serif" fontSize="11.5" fontWeight="700" letterSpacing="2">
        <text><textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">CONFIRMED</textPath></text>
        <text><textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">CONFIRMED</textPath></text>
        <path d="M37 59h10v23H37zM50 80V59l9-12 2-10c6-1 10 4 8 11l-2 7h12c5 0 7 3 6 7l-4 15c-1 4-3 5-7 5H57z"/>
        <circle cx="14" cy="60" r="1.5"/><circle cx="106" cy="60" r="1.5"/>
      </g>
    </g>
  </svg>;
}
