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
function stack(parent,name,width,gap=12,fill=null,pad=0){const n=track(figma.createAutoLayout('VERTICAL'));parent.appendChild(n);n.name=name;n.resize(width,1);n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='FIXED';n.itemSpacing=gap;n.fills=fill?paint(fill):[];n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=pad;n.clipsContent=false;return n;}
function row(parent,name,width,gap=12,fill=null,pad=0){const n=stack(parent,name,width,gap,fill,pad);n.layoutMode='HORIZONTAL';n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='AUTO';n.counterAxisAlignItems='CENTER';return n;}
function rect(parent,name,x,y,w,h,fill,radius=0){const n=track(figma.createRectangle());parent.appendChild(n);n.name=name;n.resize(w,h);n.x=x;n.y=y;n.fills=paint(fill);n.cornerRadius=radius;return n;}
function svg(parent,name,source,size){const n=track(figma.createNodeFromSvg(source));created.push(...n.findAll(()=>true).map(n=>n.id));parent.appendChild(n);n.name=name;if(size)n.resize(size,size);return n;}
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
