await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('4:131'));
await Promise.all(['Regular','Bold'].map(style=>figma.loadFontAsync({family:'Noto Sans KR',style})));
const b=await figma.getNodeByIdAsync('8:296'),mutated=[],created=[];
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const palette={paper:'#F4F1EA',white:'#FFFFFF',ink:'#181916',muted:'#6F6C64',accent:'#E92520',soft:'#FCE4E0',mid:'#F7AAA2',deep:'#A51C18'};
const coll=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='약속행 / Red Ticket v2');
const vars=await figma.variables.getLocalVariablesAsync();const colors=Object.fromEntries(vars.filter(v=>v.variableCollectionId===coll.id&&v.name.startsWith('color/')).map(v=>[v.name.slice(6),v]));
function paint(k){const p={type:'SOLID',color:rgb(palette[k])};return [figma.variables.setBoundVariableForPaint(p,'color',colors[k])];}
function text(parent,value,x,y,w,size=12,color='muted'){const n=figma.createText();n.fontName={family:'Noto Sans KR',style:'Regular'};n.fontSize=size;n.lineHeight={unit:'PERCENT',value:145};n.characters=value;n.resize(w,1);n.textAutoResize='HEIGHT';n.fills=paint(color);parent.appendChild(n);n.x=x;n.y=y;created.push(n.id);return n;}
const screens=b.findAll(n=>n.type==='FRAME'&&/^화면 \d\d · /.test(n.name));
for(const s of screens){const id=Number(s.name.slice(3,5));
 if([12,13,14,15,16,17,18,19,20].includes(id)){
  for(const n of s.findAllWithCriteria({types:['INSTANCE']})){
   if(n.name==='↶'||n.name==='↷'){const key=Object.keys(n.componentProperties).find(k=>k.startsWith('문구#'));n.setProperties({[key]:n.name==='↶'?'↶ 되돌리기':'↷ 복구하기'});for(const t of n.findAllWithCriteria({types:['TEXT']}))t.fontSize=9;mutated.push(n.id);}
  }
 }
 if([17,18,19].includes(id)){
  for(const n of s.findAllWithCriteria({types:['INSTANCE']}))if(n.name==='↶'||n.name==='↷'||n.name.includes('이번 주 반복')||n.name==='초기화'||n.name==='선택 제출'){n.visible=false;mutated.push(n.id);}
  for(const n of s.children){if(n.type==='RECTANGLE'&&n.width===393&&n.y>750){n.visible=false;mutated.push(n.id);}if(n.type==='TEXT'&&(n.characters.startsWith('■ 선택')||n.characters.includes('선택 불가')||n.characters.startsWith('12칸'))){n.visible=false;mutated.push(n.id);}if(n.name==='후보 시간'){n.visible=false;mutated.push(n.id);}}
  const highlight=s.children.find(n=>n.type==='RECTANGLE'&&Math.abs(n.y-205)<1&&Math.abs(n.width-175)<1);if(highlight){highlight.x=id===18?22:195;mutated.push(highlight.id);}
  for(const n of s.findAllWithCriteria({types:['TEXT']})){if(n.characters==='내 시간'){n.characters=id===18?'민수의 시간':'내 시간';n.fills=paint(id===18?'ink':'muted');mutated.push(n.id);}if(n.characters==='전체 시간 · 4명'){n.fills=paint(id===18?'muted':'ink');mutated.push(n.id);}if(n.characters==='민수 · 읽기 전용'&&n.parent===s){n.visible=false;mutated.push(n.id);}}
  text(s,id===18?'참여자 시간 · 읽기 전용':'전체 응답 · 읽기 전용',20,310,175,11);
  const cells=s.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.width===40&&n.height===31);
  for(const n of cells){const col=Math.round((n.x-53)/45),row=Math.round((n.y-390)/34);let count=0;
   if(col===1&&row>=1&&row<=2)count=3;if(col===2&&row>=2&&row<=3)count=2;if((col===3||col===4)&&row>=4&&row<=5)count=4;if(col===5&&row>=6&&row<=7)count=3;if(col===0&&row===7)count=1;
   n.fills=paint(id===18?(count>=3?'accent':'white'):['white','soft','mid','accent','deep'][count]);mutated.push(n.id);
  }
  if(id!==18){for(const [x,y,value,color]of [[98,424,'3명\n10–12','white'],[188,526,'4명\n13–15','white'],[278,594,'3명\n15–17','white']]){const t=text(s,value,x,y+4,40,8,color);t.textAlignHorizontal='CENTER';}}
  if(id===19){const bubble=s.children.find(n=>n.name==='누르는 동안 · 선택자');if(bubble){bubble.x=236;bubble.y=510;bubble.resize(137,bubble.height);mutated.push(bubble.id);const tail=figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="14" height="16" viewBox="0 0 14 16"><path d="M14 0 L0 8 L14 16" fill="#FFFFFF" stroke="#DDD8CD"/></svg>');s.appendChild(tail);tail.x=222;tail.y=523;created.push(tail.id,...tail.findAll(()=>true).map(n=>n.id));}}
 }
 if(id===5)text(s,'참여자 관리 · PIN 변경 · 로그아웃',25,720,343,12);
}
// The original five-screen board is now an overview; full detailed flow is below it.
const overview=await figma.getNodeByIdAsync('4:252');
for(const n of overview.findAllWithCriteria({types:['TEXT']})){if(n.characters.startsWith('이 페이지는 승인된 빨강 시안의 핵심 흐름입니다.')){n.characters='위는 핵심 흐름 요약입니다. 아래 COMPLETE RED STORYBOARD에 시작·로그인·반복·재조율·관리·종료를 포함한 전체 37개 화면을 정리했습니다.\n디자인 제안 · 실제 앱 미반영 · 예시 데이터 · 공유는 링크 복사/기본 공유이며 카카오 연동은 후속 범위';mutated.push(n.id);}}
const checked=[];for(const id of ['8:1069','8:2385','9:1813']){const n=await figma.getNodeByIdAsync(id);await n.screenshot({scale:0.65});checked.push(n.id);}
return {createdNodeIds:created,mutatedNodeIds:mutated,checkedSections:checked,screenCount:screens.length,boardId:b.id};
