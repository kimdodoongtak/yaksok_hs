// Figma desktop development plugin. No network requests or app changes.
(async () => {
if(figma.editorType!=='figma')throw new Error('Figma Design 파일에서 실행해 주세요.');
if(figma.fileKey && figma.fileKey!=='ZjcFr02Eo3878EKLEVhNgc')throw new Error('지정한 약속행 스토리보드 파일에서 실행해 주세요.');
const target=await figma.getNodeByIdAsync('4:131');
if(!target||target.type!=='PAGE')throw new Error('빨강 스토리보드 페이지를 찾을 수 없습니다.');
await figma.setCurrentPageAsync(target);
if(target.findOne(n=>n.name==='확정 확인 / 미니 티켓'))throw new Error('이미 적용된 확정 패널이 있습니다. 중복 실행을 중단합니다.');
for(const id of ['9:1386','9:1405','4:745','9:2044','9:2056','9:2068','9:2081','14:1929'])if(!await figma.getNodeByIdAsync(id))throw new Error('기존 레이어가 변경되어 적용을 중단했습니다: '+id);
function createAutoLayout(direction){const n=figma.createFrame();n.layoutMode=direction;n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='AUTO';return n;}
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('4:131'));
await Promise.all(['Regular','Bold'].map(style=>figma.loadFontAsync({family:'Noto Sans KR',style})));
const page=figma.currentPage,created=[],mutated=[],removed=[];
const palette={paper:'#F4F1EA',white:'#FFFFFF',ink:'#181916',muted:'#6F6C64',line:'#DDD8CD',subtle:'#EBE7DE',accent:'#E92520',soft:'#FCE4E0',heat0:'#FFFFFF',heat1:'#FFF0EA',heat2:'#FFD6C8',heat3:'#FFA68E',heat4:'#FF775F',heatInk:'#5C2B24'};
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const coll=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='약속행 / Red Ticket v2');
const vars=await figma.variables.getLocalVariablesAsync();
const colors=Object.fromEntries(vars.filter(v=>v.variableCollectionId===coll.id&&v.name.startsWith('color/')).map(v=>[v.name.slice(6),v]));
for(const key of ['heat0','heat1','heat2','heat3','heat4','heatInk'])if(!colors[key]){const p=figma.variables.createVariable('palette/'+key,coll,'COLOR');p.scopes=[];p.setValueForMode(coll.defaultModeId,{...rgb(palette[key]),a:1});p.setVariableCodeSyntax('WEB','var(--red-ticket-palette-'+key+')');const v=figma.variables.createVariable('color/'+key,coll,'COLOR');v.scopes=key==='heatInk'?['TEXT_FILL','STROKE_COLOR']:['FRAME_FILL','SHAPE_FILL'];v.setValueForMode(coll.defaultModeId,{type:'VARIABLE_ALIAS',id:p.id});v.setVariableCodeSyntax('WEB','var(--red-ticket-'+key+')');colors[key]=v;}
function paint(k){const p={type:'SOLID',color:rgb(palette[k]||k)};return [colors[k]?figma.variables.setBoundVariableForPaint(p,'color',colors[k]):p];}
function track(n){created.push(n.id);return n;}
function kill(n){removed.push(n.id);n.remove();}
function text(parent,value,size=14,weight=400,color='ink',width=345,align='LEFT'){const n=track(figma.createText());n.fontName={family:'Noto Sans KR',style:weight>=600?'Bold':'Regular'};n.fontSize=size;n.lineHeight={unit:'PERCENT',value:145};n.characters=value;n.fills=paint(color);n.resize(width,1);n.textAutoResize='HEIGHT';n.textAlignHorizontal=align;parent.appendChild(n);return n;}
function stack(parent,name,width,gap=12,fill=null,pad=0){const n=track(createAutoLayout('VERTICAL'));parent.appendChild(n);n.name=name;n.resize(width,1);n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='FIXED';n.itemSpacing=gap;n.fills=fill?paint(fill):[];n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=pad;n.clipsContent=false;return n;}
function row(parent,name,width,gap=12,fill=null,pad=0){const n=stack(parent,name,width,gap,fill,pad);n.layoutMode='HORIZONTAL';n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='AUTO';n.counterAxisAlignItems='CENTER';return n;}
function rect(parent,name,x,y,w,h,fill,radius=0){const n=track(figma.createRectangle());parent.appendChild(n);n.name=name;n.resize(w,h);n.x=x;n.y=y;n.fills=paint(fill);n.cornerRadius=radius;return n;}
function svg(parent,name,source,size){const n=track(figma.createNodeFromSvg(source));created.push(...n.findAll(()=>true).map(n=>n.id));parent.appendChild(n);n.name=name;if(size)n.rescale(size/n.width);return n;}
function icon(parent,kind,size=24,color='#181916'){const paths={close:'<path d="M7 7l10 10M17 7 7 17"/>',check:'<path d="m5 12 4 4L19 6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',all:'<path d="M6 5V3h13a2 2 0 0 1 2 2v14h-2"/><rect x="3" y="7" width="14" height="14" rx="3"/><path d="M7 11h6m-6 4h6"/>',arrow:'<path d="m9 5 7 7-7 7"/>'};return svg(parent,'아이콘 · '+kind,`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`,size);}
const primary=await figma.getNodeByIdAsync('4:160'),secondary=await figma.getNodeByIdAsync('4:163');
const labelKey=Object.keys((await figma.getNodeByIdAsync('4:167')).componentPropertyDefinitions).find(k=>k.startsWith('문구#'));
function button(parent,label,width=345,kind='primary'){const n=track((kind==='primary'?primary:secondary).createInstance());parent.appendChild(n);n.name=label;n.resize(width,50);n.setProperties({[labelKey]:label});return n;}
function closeHeading(parent,title,width){const h=row(parent,'제목과 닫기',width,8);text(h,title,22,700,'ink',width-44);const c=row(h,'닫기',36,0,'paper',8);c.cornerRadius=18;icon(c,'close',20);return h;}
function bottomPanel(s,name){const p=stack(s,name,393,16,'white',24);p.cornerRadius=28;const grab=row(p,'손잡이',345,0);grab.primaryAxisAlignItems='CENTER';rect(grab,'손잡이',0,0,32,4,'line',2);p.x=0;return p;}
function finishPanel(p){p.y=852-p.height;mutated.push(p.id);return {id:p.id,x:p.x,y:p.y,width:p.width,height:p.height};}
const masters=await figma.getNodeByIdAsync('4:157');
let animalRow=masters.children.find(n=>n.name==='동물 얼굴 / 선화 아바타');
const animalNames=['토끼','고양이','강아지','곰'];const people=['혜승','민수','지수','준호'];
const animalPaths=[
 '<path d="M22 29C14 8 17 2 22 5C26 7 28 18 28 27M35 27C36 13 42 2 46 6C51 10 45 23 42 30"/><path d="M17 29C10 34 10 48 18 53C25 58 41 58 49 52C57 46 53 34 46 30C37 25 25 25 17 29Z"/>',
 '<path d="M14 31L13 11Q22 10 28 21Q32 19 37 21Q44 11 51 12L50 32Q58 49 46 54Q32 59 18 54Q7 49 14 31Z"/><path d="M9 38l10 2m-10 6 10-1m26-5 10-2m-10 7 10 1"/>',
 '<path d="M16 27Q11 18 20 17Q19 8 29 12Q35 6 41 13Q51 10 50 20Q59 22 53 30Q61 37 54 43Q59 52 49 53Q46 61 38 56Q29 62 23 56Q13 59 13 50Q4 48 10 40Q3 31 16 27Z"/><path d="M15 28Q7 30 10 41m40-13q10 4 5 14"/>',
 '<path d="M16 26C4 23 9 8 19 12Q24 14 25 20Q32 18 39 20C40 8 53 9 55 17Q57 25 48 27Q57 38 51 50Q47 57 32 57Q17 57 12 49Q7 36 16 26Z"/><path d="M15 19q4-4 6 1m22 0q3-5 7-1"/>'
];
const animals={};
if(!animalRow){animalRow=row(masters,'동물 얼굴 / 선화 아바타',680,24);for(let i=0;i<4;i++){const c=track(figma.createComponent());animalRow.appendChild(c);c.name='동물 얼굴 / '+animalNames[i];c.resize(48,48);c.fills=[];c.description='닉네임과 함께 표시하는 장식 아바타. 동일 참여자에게 같은 동물을 유지합니다.';svg(c,animalNames[i],`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 64 64" fill="#FFFFFF" stroke="#383B36" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${animalPaths[i]}<circle cx="24" cy="39" r="1.5" fill="#383B36" stroke="none"/><circle cx="40" cy="39" r="1.5" fill="#383B36" stroke="none"/><path d="m30 44 2 1.5 2-1.5m-2 1.5v3m-5-1q5 4 10 0" fill="none"/><ellipse cx="19" cy="45" rx="3" ry="1.4" fill="#F8CAB9" stroke="none"/><ellipse cx="45" cy="45" rx="3" ry="1.4" fill="#F8CAB9" stroke="none"/></svg>`,48);animals[i]=c;}}else animalRow.children.forEach((n,i)=>animals[i]=n);
function avatar(parent,index,size=40){const a=track(animals[index].createInstance());parent.appendChild(a);a.rescale(size/48);return a;}
function note(id,index,value){return figma.getNodeByIdAsync(id).then(n=>{const texts=n.children.filter(c=>c.type==='TEXT');if(texts[index]){texts[index].characters=value;mutated.push(texts[index].id);}});}

// Initializer: prepend figma-cute-common.js.
const stampSpecs=[['confirmed','확정','CONFIRMED','accent',76],['cancelled','운행취소','CANCELLED','accent',132],['expired','운행종료','EXPIRED','ink',132],['invalid','노선없음','NO ROUTE','muted',132],['left','하차','CHECKED OUT','accent',132]];
let stampRow=masters.children.find(n=>n.name==='도장 / 약속 상태');const stamps={};
if(!stampRow){stampRow=row(masters,'도장 / 약속 상태',1000,38);stampRow.paddingTop=20;stampRow.paddingBottom=20;for(const [key,label,english,color,size]of stampSpecs){const c=track(figma.createComponent());stampRow.appendChild(c);c.name='도장 / '+key;c.resize(size,size);c.fills=[];c.clipsContent=false;c.description='약속 상태를 표현하는 장식 도장. 상태 문구와 함께 사용하며 개인 정보를 표시하지 않습니다.';const ink=palette[color];svg(c,'이중 원형 테두리',`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 132 132" fill="none" stroke="${ink}" stroke-linecap="round"><circle cx="66" cy="66" r="59" stroke-width="2.7"/><circle cx="66" cy="66" r="55" stroke-width="1.15"/><circle cx="66" cy="66" r="60.7" stroke-width=".55" stroke-dasharray="31 1.8 8 2.2 49 1.2"/><path d="M28 20l3 1m69 9 1 2M16 84l1 3m97-20 1 3M47 121l3-1" stroke-width="1.4"/></svg>`);const scale=size/132;const top=text(c,'YAKSOK LINE',7*scale,700,color,size,'CENTER');top.letterSpacing={unit:'PIXELS',value:1.7*scale};top.x=0;top.y=38*scale;const main=text(c,label,(key==='confirmed'?27:23)*scale,700,color,size,'CENTER');main.x=0;main.y=53*scale;const bottom=text(c,english,6.7*scale,700,color,size,'CENTER');bottom.letterSpacing={unit:'PIXELS',value:1*scale};bottom.x=0;bottom.y=88*scale;stamps[key]=c;}}else for(const n of stampRow.children)stamps[n.name.split(' / ')[1]]=n;
function stamp(parent,key,x,y,angle=-9){const n=track(stamps[key].createInstance());parent.appendChild(n);n.name='상태 도장 · '+key;n.rotation=angle;n.x=x;n.y=y;return n;}
// Confirming a candidate: bottom sheet with a miniature meeting ticket.
const confirm=await figma.getNodeByIdAsync('9:1345');kill(await figma.getNodeByIdAsync('9:1386'));
const cp=bottomPanel(confirm,'확정 확인 / 미니 티켓');cp.itemSpacing=16;closeHeading(cp,'이 시간으로 확정할까요?',345);
const mini=stack(cp,'BOARDING PASS / 확정 전 요약',345,0,'paper');mini.cornerRadius=16;mini.clipsContent=true;
const strip=row(mini,'티켓 띠',345,8,'accent',12);const bt=text(strip,'BOARDING PASS',10,700,'white',233);bt.letterSpacing={unit:'PIXELS',value:1};text(strip,'약속행',11,700,'white',80,'RIGHT');
const ticketBody=stack(mini,'날짜와 시간',345,10,null,16);text(ticketBody,'11월 23일 (월)',12,400,'muted',313);const details=row(ticketBody,'시간과 인원',313,12);text(details,'13:00 → 15:00',24,700,'accent',200);const chip=stack(details,'참석 가능 인원',101,0,'soft',8);chip.cornerRadius=16;text(chip,'4명 전원 가능',11,700,'accent',85,'CENTER');
for(const value of ['확정하면 참여자 모두 같은 약속 결과를 볼 수 있어요.','확정 후에도 재조율로 시간을 다시 정할 수 있어요.']){const r=row(cp,'확정 안내',345,10);text(r,'•',15,700,'accent',8);text(r,value,13,400,'ink',327);}
button(cp,'이 시간으로 확정  ✓',345);text(cp,'다른 시간 보기',14,700,'muted',345,'CENTER');const confirmBounds=finishPanel(cp);
// Same stamped treatment in the full result and the five-screen overview.
for(const id of ['9:1405','4:745']){const s=await figma.getNodeByIdAsync(id);for(const n of [...s.children]){if(n.x>=295&&n.x<=310&&n.y>=420&&n.y<480&&(n.type==='ELLIPSE'||n.type==='TEXT'))kill(n);if(n.type==='TEXT'&&n.characters==='13:00 → 15:00'){n.fontSize=27;n.resize(215,n.height);mutated.push(n.id);}}stamp(s,'confirmed',268,411,-7);mutated.push(s.id);}
// End states: decorative stamps, with no private appointment details exposed.
const exits=[['9:2044','cancelled','취소된 약속입니다.'],['9:2056','expired','만료된 약속입니다'],['9:2068','invalid','유효하지 않은 초대 링크입니다.'],['9:2081','left','약속에서 나왔어요']];
for(const [id,key,title]of exits){const s=await figma.getNodeByIdAsync(id);for(const n of [...s.children])kill(n);s.fills=paint('paper');const logo=row(s,'약속행',160,8);logo.x=24;logo.y=24;const mark=track(figma.createFrame());logo.appendChild(mark);mark.resize(11,25);mark.fills=paint('ink');mark.cornerRadius=5;rect(mark,'빨강 신호',3,4,5,7,'accent',3);text(logo,'약속행',16,700,'ink',130);stamp(s,key,126,224,-9);const content=stack(s,'종료 상태 안내',345,14);content.x=24;content.y=405;text(content,title,23,700,'ink',345,'CENTER');if(key==='left'){text(content,'민수님이 방장을 이어받았어요.',13,400,'muted',345,'CENTER');const action=button(s,'처음으로',345);action.fills=paint('ink');action.x=24;action.y=778;}mutated.push(s.id);}
await note('9:1396',2,'하단 패널의 미니 티켓에서 날짜·시간·참석 인원을 확인한다. 확정 후 재조율 가능 안내와 확정/다른 시간 보기 동작을 제공한다.');
await note('9:1494',2,'기차 사진·SEE YOU SOON 표지, 날짜·시간·소요 시간·참석자, 원형 확정 도장, 결과 링크 복사를 제공한다.');
await note('9:2047',2,'로그인 없이 취소 상태 문구와 장식용 운행취소 도장을 표시한다. 일정·참여자 등 개인 정보는 노출하지 않는다.');
await note('9:2059',2,'만료 상태 문구와 장식용 운행종료 도장을 표시하고 약속 정보 접근을 막는다.');
await note('9:2071',2,'유효하지 않은 초대 링크 문구와 장식용 노선없음 도장을 표시한다.');
await note('9:2112',2,'하차 도장과 나가기 완료 안내를 표시한다. 방장 승계가 있었다면 후임 이름을 안내하고 처음으로 이동한다.');


// Ensure avatar instances use the intended compact geometry in the participant bubble.
for(const id of ['14:1551','14:1560','14:1569','14:1578']){const c=await figma.getNodeByIdAsync(id);for(const child of c.children)if('constraints' in child)child.constraints={horizontal:'SCALE',vertical:'SCALE'};}
const bubble=await figma.getNodeByIdAsync('14:1929');
for(const r of bubble.children){if(r.type!=='FRAME')continue;r.resize(109,32);r.primaryAxisSizingMode='FIXED';r.counterAxisSizingMode='FIXED';r.counterAxisAlignItems='CENTER';for(const a of r.children)if(a.type==='INSTANCE'){a.resize(28,28);a.layoutSizingHorizontal='FIXED';a.layoutSizingVertical='FIXED';}}
const drawer=await figma.getNodeByIdAsync('14:1618');
for(const a of drawer.findAllWithCriteria({types:['INSTANCE']})){const master=await a.getMainComponentAsync();if(master&&master.name.startsWith('동물 얼굴 / ')){a.resize(40,40);a.layoutSizingHorizontal='FIXED';a.layoutSizingVertical='FIXED';}}
const review=await figma.getNodeByIdAsync('9:1345');figma.currentPage.selection=[review];figma.viewport.scrollAndZoomIntoView([review]);
figma.closePlugin('확정 확인창과 상태 도장을 적용했습니다.');
})().catch(error=>{console.error(error);figma.closePlugin('적용 중단: '+error.message);});
