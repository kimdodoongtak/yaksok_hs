// Inject DATA (red screens and composition notes) before executing with use_figma.
const pageName = '02 · 빨강 티켓 스토리보드';
if (figma.root.children.some(p => p.name === pageName)) throw new Error('이미 같은 이름의 페이지가 있습니다. 기존 노드를 확인한 뒤 이어서 작업하세요.');
const fonts = await figma.listAvailableFontsAsync();
const family = 'Noto Sans KR';
const regular = fonts.find(f => f.fontName.family === family && f.fontName.style === 'Regular');
const bold = fonts.find(f => f.fontName.family === family && f.fontName.style === 'Bold');
if (!regular || !bold) throw new Error('기준 글꼴 Noto Sans KR Regular/Bold를 사용할 수 없습니다.');
await Promise.all([figma.loadFontAsync(regular.fontName), figma.loadFontAsync(bold.fontName)]);
const page = figma.createPage(); page.name = pageName;
await figma.setCurrentPageAsync(page);
const rgb = hex => ({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255});
const colors = DATA.colors.red;
const collection = figma.variables.createVariableCollection('약속행 / Red Ticket v2');
const variables = {}, variableIds = [], styles = new Map();
for (const [key,hex] of Object.entries(colors)) {
  const primitive = figma.variables.createVariable('palette/'+key,collection,'COLOR');
  primitive.setValueForMode(collection.defaultModeId,{...rgb(hex),a:1}); primitive.scopes=[]; variableIds.push(primitive.id);
  const semantic = figma.variables.createVariable('color/'+key,collection,'COLOR');
  semantic.setValueForMode(collection.defaultModeId,{type:'VARIABLE_ALIAS',id:primitive.id});
  semantic.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];
  variables[key]=semantic; variableIds.push(semantic.id);
}
const spacing = {};
for (const [key,value,scope] of [['radius/button',24,'CORNER_RADIUS'],['radius/slot',8,'CORNER_RADIUS'],['gap/row',40,'GAP'],['gap/notes',12,'GAP']]) {
  const variable=figma.variables.createVariable(key,collection,'FLOAT');variable.setValueForMode(collection.defaultModeId,value);variable.scopes=[scope];spacing[key]=variable;variableIds.push(variable.id);
}
function paint(key) {
  if (!key) return [];
  const p={type:'SOLID',color:rgb(colors[key]||key)};
  return [variables[key]?figma.variables.setBoundVariableForPaint(p,'color',variables[key]):p];
}
function locate(node,parent,n) {
  parent.appendChild(node);node.name=n.name||n.value||n.type;
  if(n.w&&n.h)node.resize(n.w,n.h);
  node.x=n.x||0;node.y=n.y||0;
  return node;
}
function text(parent,n) {
  const node=figma.createText();node.fontName=n.weight>=600?bold.fontName:regular.fontName;
  node.fontSize=n.size;node.lineHeight={unit:'PERCENT',value:145};node.letterSpacing={unit:'PIXELS',value:n.tracking||0};
  const key=[n.size,n.weight>=600?'Bold':'Regular',n.tracking||0].join('/');
  if(!styles.has(key)) {const s=figma.createTextStyle();s.name='약속행 v2 / '+key;s.fontName=node.fontName;s.fontSize=n.size;s.lineHeight=node.lineHeight;s.letterSpacing=node.letterSpacing;styles.set(key,s);}
  node.textStyleId=styles.get(key).id;node.characters=n.value;node.fills=paint(n.color||'ink');
  node.textAlignHorizontal=(n.align||'left').toUpperCase();locate(node,parent,n);node.textAutoResize='HEIGHT';return node;
}
function stack(parent,name,width,direction='VERTICAL',gap=12) {
  const node=figma.createAutoLayout(direction);parent.appendChild(node);node.name=name;node.fills=[];node.resize(width,1);
  node.primaryAxisSizingMode='AUTO';node.counterAxisSizingMode='FIXED';node.itemSpacing=gap;node.clipsContent=false;return node;
}
const mastersArea=stack(page,'원본 구성요소 · 인스턴스로 사용',1700,'VERTICAL',32);mastersArea.x=2520;mastersArea.y=120;
text(mastersArea,{type:'text',value:'약속행 / RED COMPONENTS',size:28,weight:700,w:1600,h:50,color:'ink'});
const masters={}; const sets=[];
for(const kind of ['button','slot']) {
  const states=kind==='button'?['primary','secondary','disabled']:['empty','selected','disabled','partial'];
  const variants=states.map(state=>{
    const c=figma.createComponent();c.name='state='+state;c.resize(kind==='button'?216:80,kind==='button'?46:42);
    c.layoutMode='HORIZONTAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';c.paddingLeft=6;c.paddingRight=6;
    c.cornerRadius=kind==='button'?24:8;c.setBoundVariable('topLeftRadius',spacing['radius/'+kind]);c.setBoundVariable('topRightRadius',spacing['radius/'+kind]);c.setBoundVariable('bottomLeftRadius',spacing['radius/'+kind]);c.setBoundVariable('bottomRightRadius',spacing['radius/'+kind]);
    const solid=['primary','selected'].includes(state);
    c.fills=paint(solid?'accent':state==='partial'?'soft':state==='disabled'?'subtle':'white');c.strokes=paint(state==='secondary'?'ink':state==='empty'?'line':null);c.strokeWeight=1;
    const labelKey=c.addComponentProperty('문구','TEXT',kind==='button'?'버튼':'');
    const label=text(c,{type:'text',value:kind==='button'?'버튼':'',size:13,weight:700,w:120,h:20,align:'center',color:solid?'white':state==='disabled'?'muted':state==='partial'?'accent':'ink'});
    label.textAutoResize='WIDTH_AND_HEIGHT';label.componentPropertyReferences={characters:labelKey};masters[kind+'/'+state]={component:c,labelKey};return c;
  });
  const set=figma.combineAsVariants(variants,mastersArea);set.name=kind==='button'?'버튼 / Red Ticket':'시간 칸 / Red Ticket';
  variants.forEach((v,i)=>{v.x=20+i*(kind==='button'?236:100);v.y=20;});set.resizeWithoutConstraints(kind==='button'?748:420,90);set.fills=[];sets.push(set.id);
}
function render(parent,n) {
  if(n.type==='text') return text(parent,n);
  if(n.type==='button'||n.type==='slot') {
    const m=masters[n.type+'/'+n.variant];const node=m.component.createInstance();locate(node,parent,n);node.setProperties({[m.labelKey]:n.value});
    const label=node.findOne(child=>child.type==='TEXT');label.fontSize=n.type==='button'&&n.w>90?13:11;return node;
  }
  if(n.type==='path') {
    const color=key=>key?colors[key]||key:'none';
    const node=figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n.w}" height="${n.h}" viewBox="0 0 ${n.w} ${n.h}"><path d="${n.d}" fill="${color(n.fill)}" stroke="${color(n.stroke)}" stroke-width="${n.sw||0}" stroke-linecap="round" stroke-linejoin="round" ${n.dashed?'stroke-dasharray="3 4"':''}/></svg>`);
    return locate(node,parent,n);
  }
  const node=n.type==='circle'?figma.createEllipse():figma.createRectangle();locate(node,parent,n);
  node.fills=n.type==='image'?[{type:'IMAGE',imageHash:'6ff1bce9bd3cfee4d04296fb92e6a5ed3411e67b',scaleMode:'FILL'}]:paint(n.fill);
  node.strokes=paint(n.stroke);node.strokeWeight=n.sw||1;if(n.radius)node.cornerRadius=n.radius;if(n.opacity!==undefined)node.opacity=n.opacity;
  return node;
}
const headerVariants=[];const headerMasters={};
for(const [i,s] of DATA.screens.entries()) {
  const stage=i===0?0:i===1?1:i===4?3:2;
  if(headerMasters[stage])continue;
  const c=figma.createComponent();c.name='step='+stage;c.resize(393,112);c.fills=paint('paper');c.clipsContent=true;
  const end=s.nodes.findIndex(n=>n.type==='text'&&n.value.startsWith('STEP'));
  const count=end<0?16:end;
  s.nodes.slice(1,count).forEach(n=>render(c,n));headerVariants.push(c);headerMasters[stage]=c;
}
const headerSet=figma.combineAsVariants(headerVariants,mastersArea);headerSet.name='상단 진행 / Red Ticket';headerSet.fills=[];
headerVariants.forEach((v,i)=>{v.x=20+(i%2)*413;v.y=20+Math.floor(i/2)*132;});headerSet.resizeWithoutConstraints(846,284);sets.push(headerSet.id);
const board=stack(page,'약속행 · RED STORYBOARD v2',2245,'VERTICAL',28);board.x=120;board.y=120;board.fills=paint('#E7E5E0');board.paddingTop=40;board.paddingBottom=40;board.paddingLeft=40;board.paddingRight=40;
text(board,{type:'text',value:'약속행 / RED TICKET STORYBOARD',size:32,weight:700,w:2165,h:55,color:'ink'});
text(board,{type:'text',value:'02 · 신규 디자인 제안    |    설정 → 초대 → 시간 투표 → 후보 선택 → 약속 확정\n393 × 852 모바일 기준 · 기존 기능 정책 유지 · 화면 아래 필수 기능 명시 · 실제 앱 미반영',size:15,w:2165,h:48,color:'muted'});
const row=stack(board,'핵심 흐름 01–05',2165,'HORIZONTAL',40);row.setBoundVariable('itemSpacing',spacing['gap/row']);row.counterAxisSizingMode='AUTO';
const screenIds=[];const noteIds=[];
DATA.screens.forEach((s,i)=>{
  const card=stack(row,s.name+' / 화면 + 기능 명세',393,'VERTICAL',20);
  const screen=figma.createFrame();card.appendChild(screen);screen.name=s.name;screen.resize(393,852);screen.fills=paint('paper');screen.clipsContent=true;screenIds.push(screen.id);
  const stage=i===0?0:i===1?1:i===4?3:2;
  const header=headerMasters[stage].createInstance();screen.appendChild(header);header.x=0;header.y=0;
  const end=s.nodes.findIndex(n=>n.type==='text'&&n.value.startsWith('STEP'));const start=end<0?16:end;
  s.nodes.slice(start).forEach(n=>render(screen,n));
  const note=stack(card,'필수 기능과 화면 전환',393,'VERTICAL',12);note.setBoundVariable('itemSpacing',spacing['gap/notes']);noteIds.push(note.id);
  text(note,{type:'text',value:s.name,size:18,weight:700,w:393,h:30,color:'ink'});
  text(note,{type:'text',value:s.notes[1],size:13,w:393,h:40,color:'ink'});
  text(note,{type:'text',value:'필수 기능\n'+s.notes[3],size:12,w:393,h:60,color:'ink'});
  text(note,{type:'text',value:'배치 제안\n'+s.notes[2],size:12,w:393,h:60,color:'muted'});
});
const sheet=figma.createFrame();board.appendChild(sheet);sheet.name='공통 구성요소와 색상';sheet.resize(1100,640);sheet.fills=paint('paper');DATA.sheets[0].nodes.forEach(n=>render(sheet,n));
text(board,{type:'text',value:'이 페이지는 승인된 빨강 시안의 핵심 흐름입니다. 로그인·PIN·재조율·참여자 관리·취소의 상세 화면 및 기존 정책은 이전 스토리보드에 유지합니다.\n예시 날짜와 참여자 · 별도 예약·결제 기능 없음 · 공유는 링크 복사/기본 공유이며 카카오 연동은 후속 범위',size:13,w:2165,h:50,color:'muted'});
figma.currentPage.selection=[board];figma.viewport.scrollAndZoomIntoView([board]);
const nodes=page.findAll(()=>true);const counts={};for(const n of nodes)counts[n.type]=(counts[n.type]||0)+1;
const imageNodes=nodes.filter(n=>Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height}));
const fontFamilies=[...new Set(nodes.filter(n=>n.type==='TEXT').map(n=>n.fontName.family))];
await board.screenshot({scale:0.65});
return {pageId:page.id,boardId:board.id,screenIds,noteIds,componentSetIds:sets,collectionId:collection.id,variableIds,textStyleIds:[...styles.values()].map(s=>s.id),createdNodeIds:[page.id,...nodes.map(n=>n.id)],counts,imageNodes,fontFamilies,boardBounds:{width:board.width,height:board.height}};
