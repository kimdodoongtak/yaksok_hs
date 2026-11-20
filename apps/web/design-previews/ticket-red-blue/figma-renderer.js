/* global figma, DATA */
// Local development-plugin entry point. This does not run in the product app.
async function importConcept() {
  const fonts = await figma.listAvailableFontsAsync();
  const family = ['Noto Sans KR', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', 'Inter'].find(f => fonts.some(x => x.fontName.family === f));
  if (!family) throw new Error('사용 가능한 글꼴을 찾을 수 없습니다.');
  const choices = fonts.filter(x => x.fontName.family === family).map(x => x.fontName);
  const regular = choices.find(x => /^(Regular|Normal|Medium)$/.test(x.style)) || choices[0];
  const bold = choices.find(x => x.style === 'Bold') || regular;
  await Promise.all([figma.loadFontAsync(regular), figma.loadFontAsync(bold)]);
  const rgb = hex => ({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255});
  const collection = figma.variables.createVariableCollection('Ticket concept · Red / Blue');
  const vars = {};
  for (const theme of ['red', 'blue']) {
    vars[theme] = {};
    for (const [key, hex] of Object.entries(DATA.colors[theme])) {
      const variable = figma.variables.createVariable(theme+'/'+key,collection,'COLOR');
      variable.setValueForMode(collection.defaultModeId,{...rgb(hex),a:1});
      variable.scopes = ['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];
      vars[theme][key] = variable;
    }
  }
  function paint(theme, key) {
    if (!key) return [];
    const p = {type:'SOLID',color:rgb(DATA.colors[theme][key] || key)};
    return [vars[theme][key] ? figma.variables.setBoundVariableForPaint(p,'color',vars[theme][key]) : p];
  }
  function base(node,parent,n) {
    parent.appendChild(node); node.name=n.name||n.value||n.type;
    node.x=n.x||0; node.y=n.y||0;
    if(n.w && n.h) node.resize(n.w,n.h);
    return node;
  }
  function text(parent,theme,n) {
    const t = figma.createText();
    t.fontName=n.weight>=600?bold:regular;t.fontSize=n.size;
    t.lineHeight={unit:'PERCENT',value:145};t.letterSpacing={unit:'PIXELS',value:n.tracking||0};
    t.characters=n.value;t.fills=paint(theme,n.color||'ink');
    t.textAlignHorizontal=(n.align||'left').toUpperCase();
    base(t,parent,n);t.textAutoResize='HEIGHT';return t;
  }
  function decode(s) {
    const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const output=new Uint8Array(Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0));
    let bit=0,bits=0,index=0;
    for(const ch of s){if(ch==='=')break;bit=(bit<<6)|chars.indexOf(ch);bits+=6;if(bits>=8){bits-=8;output[index++]=(bit>>bits)&255;}}
    return output;
  }
  const image=figma.createImage(decode(DATA.image));
  const page=figma.createPage();page.name='제안 02 · 티켓 Red / Blue';
  await figma.setCurrentPageAsync(page);
  const masterArea=figma.createFrame();masterArea.name='구성요소 원본';masterArea.resize(2300,420);masterArea.x=0;masterArea.y=3650;masterArea.fills=[];page.appendChild(masterArea);
  const masters={};
  for (const [ti,theme] of ['red','blue'].entries()) {
    masters[theme]={};
    for (const [ki,kind] of ['button','slot'].entries()) {
      const states=kind==='button'?['primary','secondary','disabled']:['empty','selected','disabled','partial'];
      const variants=[];
      states.forEach((state,i)=>{
        const c=figma.createComponent();c.name='State='+state;c.resize(kind==='button'?200:80,kind==='button'?46:42);
        c.layoutMode='HORIZONTAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';
        c.paddingLeft=6;c.paddingRight=6;c.cornerRadius=kind==='button'?23:8;
        const solid=['primary','selected'].includes(state);
        c.fills=paint(theme,solid?'accent':state==='partial'?'soft':state==='disabled'?'subtle':'white');
        c.strokes=paint(theme,state==='secondary'?'ink':state==='empty'?'line':null);c.strokeWeight=1;
        const prop=c.addComponentProperty('Label','TEXT',kind==='button'?'버튼':'');
        const label=text(c,theme,{type:'text',x:0,y:0,w:100,h:20,size:13,weight:700,value:kind==='button'?'버튼':'',color:solid?'white':state==='disabled'?'muted':state==='partial'?'accent':'ink',align:'center'});
        label.textAutoResize='WIDTH_AND_HEIGHT';label.componentPropertyReferences={characters:prop};
        c.x=i*(kind==='button'?220:100);c.y=0;variants.push(c);masters[theme][kind+'/'+state]={component:c,prop};
      });
      const set=figma.combineAsVariants(variants,masterArea);set.name=theme+'/'+kind;set.x=ti*1120;set.y=ki*160;set.fills=[];
    }
  }
  function render(parent,theme,n) {
    let node;
    if(n.type==='text')return text(parent,theme,n);
    if(n.type==='button'||n.type==='slot'){
      const m=masters[theme][n.type+'/'+n.variant];node=m.component.createInstance();base(node,parent,n);node.setProperties({[m.prop]:n.value});
      const label=node.findOne(x=>x.type==='TEXT');label.fontSize=n.type==='button'&&n.w>90?13:11;return node;
    }
    if(n.type==='path'){
      const color=k=>k?DATA.colors[theme][k]||k:'none';
      node=figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n.w}" height="${n.h}" viewBox="0 0 ${n.w} ${n.h}"><path d="${n.d}" fill="${color(n.fill)}" stroke="${color(n.stroke)}" stroke-width="${n.sw||0}" stroke-linecap="round" stroke-linejoin="round" ${n.dashed?'stroke-dasharray="3 4"':''}/></svg>`);
      base(node,parent,n);return node;
    }
    node=n.type==='circle'?figma.createEllipse():figma.createRectangle();base(node,parent,n);
    node.fills=n.type==='image'?[{type:'IMAGE',imageHash:image.hash,scaleMode:'FILL'}]:paint(theme,n.fill);
    node.strokes=paint(theme,n.stroke);node.strokeWeight=n.sw||1;
    if(n.radius)node.cornerRadius=n.radius;if(n.opacity!==undefined)node.opacity=n.opacity;
    return node;
  }
  const boards=[];
  for(const [ti,theme] of ['red','blue'].entries()){
    const board=figma.createFrame();board.name=theme==='red'?'A · RED':'B · BLUE';board.resize(2240,1770);board.x=0;board.y=ti*1820;board.fills=[{type:'SOLID',color:rgb('#E7E5E0')}];page.appendChild(board);boards.push(board);
    text(board,theme,{type:'text',x:32,y:30,w:2176,h:45,value:theme==='red'?'약속행 / VERMILION RED':'약속행 / COBALT BLUE',size:30,weight:700,color:'ink'});
    text(board,theme,{type:'text',x:32,y:85,w:2100,h:32,value:'디자인 제안 · 393 × 852 · 기존 기능 정책 유지 · 실제 앱 미반영',size:15,color:'muted'});
    DATA.screens.filter(x=>x.theme===theme).forEach((s,i)=>{
      const frame=figma.createFrame();frame.name=s.name;frame.resize(s.w,s.h);frame.x=32+i*438;frame.y=140;frame.fills=[];frame.clipsContent=true;board.appendChild(frame);
      s.nodes.forEach(n=>render(frame,theme,n));
      text(board,theme,{type:'text',x:32+i*438,y:1014,w:393,h:30,value:s.name,size:17,weight:700,color:'ink'});
      text(board,theme,{type:'text',x:32+i*438,y:1052,w:393,h:90,value:s.notes[1]+'\n제안: '+s.notes[2]+'\n필수: '+s.notes[3],size:12,color:'muted'});
    });
    const sheet=DATA.sheets.find(x=>x.theme===theme);const cf=figma.createFrame();cf.name='구성요소 비교';cf.resize(sheet.w,sheet.h);cf.x=32;cf.y=1115;cf.fills=[];board.appendChild(cf);sheet.nodes.forEach(n=>render(cf,theme,n));
    // Keep notes clear of the component sheet.
    cf.y=1200;board.resize(2240,1870);
    board.y=ti*1920;
  }
  masterArea.y=3860;
  figma.currentPage.selection=boards;figma.viewport.scrollAndZoomIntoView(boards);
  figma.closePlugin('빨강·파랑 10개 화면과 구성요소를 새 페이지에 추가했습니다.');
}
importConcept().catch(error=>figma.closePlugin('추가 중 오류: '+String(error)));
