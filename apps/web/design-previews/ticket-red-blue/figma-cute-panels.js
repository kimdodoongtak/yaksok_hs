// Initializer: prepend figma-cute-common.js.
const bounds=[];
// Reset: two clear scope choices, instead of stacked generic buttons.
const reset=await figma.getNodeByIdAsync('8:1468');kill(await figma.getNodeByIdAsync('8:1581'));
const rp=bottomPanel(reset,'시간 선택 초기화 / 하단 패널');closeHeading(rp,'시간 선택 초기화',345);text(rp,'지울 범위를 선택해 주세요.',13,400,'muted');
for(const [title,body,kind]of [['이번 주만 초기화','11월 22일–28일의 선택을 지워요.','calendar'],['전체 시간 초기화','모든 주의 선택을 지워요.','all']]){const opt=row(rp,title,345,14,'paper',16);opt.cornerRadius=16;const iw=row(opt,'범위 아이콘',40,0,'white',8);iw.cornerRadius=12;icon(iw,kind,24);const label=stack(opt,'범위 설명',231,4);text(label,title,16,700,'ink',231);text(label,body,12,400,'muted',231);icon(opt,'arrow',14);}
text(rp,'지난 시간은 유지돼요. 되돌리기로 복원할 수 있어요.\n선택 제출을 눌러야 저장돼요.',12,400,'muted');bounds.push(finishPanel(rp));
// Participant drawer: compact list with animal faces and submission checkmarks.
const drawer=await figma.getNodeByIdAsync('8:1602');kill(await figma.getNodeByIdAsync('8:1715'));
const dp=stack(drawer,'참여자 명단 / 동물 아바타',321,18,'white',22);dp.x=72;dp.y=0;dp.minHeight=852;dp.cornerRadius=24;
const dh=row(dp,'명단 제목',277,8);text(dh,'약속 정보',20,700,'ink',241);icon(dh,'close',24);
const meta=stack(dp,'약속 요약',277,6);text(meta,'11.15 → 12.15',23,700,'ink',277);text(meta,'모집 중 · 소요 2시간 · 정원 5명',12,400,'muted',277);
const caption=row(dp,'참여자와 제출 상태',277,8);text(caption,'참여자 4',14,700,'muted',181);text(caption,'응답 완료',11,400,'muted',88,'RIGHT');
const list=stack(dp,'전체 일정과 참여자',277,4);
const all=row(list,'전체 일정 · 현재 보기',277,12,'paper',12);all.cornerRadius=12;icon(all,'calendar',26);text(all,'전체 일정',16,700,'ink',179);icon(all,'check',20);
for(let i=0;i<4;i++){const r=row(list,people[i]+' · 제출 완료',277,12,null,8);avatar(r,i,40);text(r,people[i],17,700,'ink',i===0?51:169);if(i===0){const me=stack(r,'나',30,0,'subtle',4);me.cornerRadius=8;text(me,'나',11,700,'muted',22,'CENTER');const spacer=rect(r,'여백',0,0,64,1,'white');}icon(r,'check',18);}
rect(dp,'명단 구분선',0,0,277,1,'line');
for(const t of ['약속 조건 보기','참여자 관리','초대 링크 · 내 참여 정보']){const r=row(dp,t,277,8);text(r,t,13,400,'muted',245);icon(r,'arrow',16,'#6F6C64');}
text(dp,'혜승 · 방장 · 응답 제출 완료',11,400,'muted',277);bounds.push({id:dp.id,width:dp.width,height:dp.height});
// Heatmap: lighter coral, continuous same-person ranges, larger labels.
const blocks=[{col:1,row:1,len:2,count:3,time:'10–12'},{col:2,row:2,len:2,count:2,time:'11–13'},{col:3,row:4,len:2,count:4,time:'13–15'},{col:4,row:4,len:2,count:4,time:'13–15'},{col:5,row:6,len:2,count:3,time:'15–17'},{col:0,row:7,len:1,count:1,time:null}];
for(const id of ['8:1744','8:2390','8:2605']){const s=await figma.getNodeByIdAsync(id),person=id==='8:2390';
 for(const n of [...s.children]){if(!n.visible)continue;if((n.type==='INSTANCE'&&n.width===40&&n.height===31)||(n.type==='TEXT'&&n.x>=53&&n.y>=390&&n.y<720)||n.name==='후보 시간'||n.name==='누르는 동안 · 선택자'||(n.type==='FRAME'&&n.width===14&&n.height===16)){kill(n);}else if(n.name==='가로 묶음'&&n.y>700){kill(n);}}
 const grid=track(figma.createFrame());s.appendChild(grid);grid.name='연속 구간 히트맵';grid.resize(315,303);grid.x=53;grid.y=390;grid.fills=[];grid.clipsContent=false;
 const occupied=new Set();for(const b of blocks){if(person&&b.count<3)continue;for(let r=0;r<b.len;r++)occupied.add(b.col+':'+(b.row+r));}
 for(let r=0;r<9;r++)for(let c=0;c<7;c++){if(!occupied.has(c+':'+r)){const cell=rect(grid,'빈 시간',c*45,r*34,40,31,'heat0',9);cell.strokes=paint('line');cell.strokeWeight=.7;}}
 for(const b of blocks){if(person&&b.count<3)continue;const x=b.col*45,y=b.row*34,h=b.len*34-3;const block=stack(grid,'연속 가능 시간 · '+b.time,40,1,person?'heat3':'heat'+b.count,0);block.resize(40,h);block.primaryAxisSizingMode='FIXED';block.primaryAxisAlignItems='CENTER';block.counterAxisAlignItems='CENTER';block.cornerRadius=10;block.x=x;block.y=y;if(b.count>=2){if(!person)text(block,b.count+'명',14,700,'heatInk',40,'CENTER');text(block,b.time,13,700,'heatInk',40,'CENTER');}}
 const legend=row(s,'색상 범례 / 코랄',315,8);legend.x=53;legend.y=730;text(legend,person?'선택한 시간':'0명',11,400,'muted',person?100:30);if(!person){const ramp=row(legend,'히트맵 색상',218,0);for(let i=0;i<5;i++)rect(ramp,'heat'+i,0,0,43.6,12,'heat'+i);text(legend,'4명',11,400,'muted',35,'RIGHT');}else rect(legend,'가능',0,0,28,12,'heat3',4);
 for(const n of s.children){if(n.type==='TEXT'&&n.x===20&&n.y>=390&&n.y<720){n.fontSize=11;n.fills=paint('muted');mutated.push(n.id);}}
 if(id==='8:2605'){const bubble=stack(s,'누르는 동안 / 동물과 닉네임',133,5,'white',12);bubble.x=240;bubble.y=480;bubble.cornerRadius=16;bubble.strokes=paint('line');bubble.strokeWeight=1;bubble.effects=[{type:'DROP_SHADOW',color:{r:.2,g:.12,b:.08,a:.1},offset:{x:0,y:5},radius:18,spread:0,visible:true,blendMode:'NORMAL'}];for(let i=0;i<4;i++){const r=row(bubble,people[i],109,9);avatar(r,i,28);text(r,people[i],14,700,'ink',72);}const tail=svg(s,'선택 구간을 가리키는 꼬리','<svg xmlns="http://www.w3.org/2000/svg" width="14" height="18" viewBox="0 0 14 18"><path d="M14 0L0 9L14 18" fill="#FFFFFF" stroke="#DDD8CD" stroke-width="1"/></svg>');tail.x=226;tail.y=544;bounds.push({id:bubble.id,x:bubble.x,y:bubble.y,width:bubble.width,height:bubble.height});}
 mutated.push(s.id);
}
// Keep component documentation and the updated screen language consistent.
const sheet=page.findOne(n=>n.type==='FRAME'&&n.name==='공통 구성요소와 색상');if(sheet){const swatches=sheet.children.filter(n=>n.type==='RECTANGLE'&&n.y===393&&n.x>=533).sort((a,b)=>a.x-b.x);swatches.forEach((n,i)=>{n.fills=paint('heat'+i);mutated.push(n.id);});}
await note('8:1593',2,'이번 주 / 전체 시간의 초기화 범위를 카드 두 개로 선택한다. 하단 패널에서 닫기와 범위별 설명을 제공한다.');
await note('8:1735',2,'전체 일정과 동물 얼굴·닉네임 명단을 표시한다. 체크는 응답 완료, 배경 강조는 현재 보기다. 이름을 누르면 그 사람의 시간을 조회한다.');
await note('8:1953',2,'밝은 코랄 농도와 0명~전체 인원 범례로 집계한다. 같은 날짜·같은 참여자 조합의 연속 구간을 합쳐 인원·시간을 크게 표시한다.');
await note('8:2816',2,'누르는 동안 선택 구간을 가리키는 하나의 말풍선에 동물 얼굴과 닉네임을 함께 표시한다. 동일 참여자는 서랍과 같은 동물을 사용한다.');
return {createdNodeIds:created,mutatedNodeIds:mutated,removedNodeIds:removed,avatarComponentIds:Object.values(animals).map(n=>n.id),bounds};
