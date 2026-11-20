"""Generate a reviewable concept and native Figma import data. No application changes."""
from pathlib import Path
import base64, html, json, textwrap, zipfile

ROOT = Path(__file__).resolve().parent
PHOTO = ROOT.parents[1] / 'public/images/ticket-train.png'
PHOTO64 = base64.b64encode(PHOTO.read_bytes()).decode()
THEMES = {
    'red': {'accent': '#E92520', 'soft': '#FCE4E0', 'mid': '#F7AAA2', 'deep': '#A51C18'},
    'blue': {'accent': '#315BDB', 'soft': '#E5EBFC', 'mid': '#A6B8F0', 'deep': '#203D99'},
}
COMMON = {'paper': '#F4F1EA', 'white': '#FFFFFF', 'ink': '#181916', 'muted': '#6F6C64', 'line': '#DDD8CD', 'subtle': '#EBE7DE'}

class Canvas:
    def __init__(self, theme, name, w=393, h=852):
        self.theme, self.name, self.w, self.h = theme, name, w, h
        self.colors = COMMON | THEMES[theme]
        self.nodes = []
    def node(self, kind, **p): self.nodes.append({'type': kind, **p})
    def rect(self, x, y, w, h, fill='white', radius=0, stroke=None, sw=1, name='면'):
        self.node('rect', x=x, y=y, w=w, h=h, fill=fill, radius=radius, stroke=stroke, sw=sw, name=name)
    def text(self, x, y, value, size=14, color='ink', weight=400, w=None, align='left', tracking=0, name=None):
        lines = value.split('\n')
        w = min(353, self.w-x-20) if w is None else w
        self.node('text', x=x, y=y, w=w, h=len(lines)*size*1.45, value=value, size=size, color=color, weight=weight, align=align, tracking=tracking, name=name or value)
    def line(self, x1, y1, x2, y2, color='line', sw=1, dashed=False):
        self.node('path', x=0,y=0,w=self.w,h=self.h,d=f'M{x1} {y1}L{x2} {y2}', stroke=color, sw=sw, fill=None, dashed=dashed, name='구분선')
    def circle(self,x,y,r,fill='white',stroke=None,sw=1):
        self.node('circle',x=x-r,y=y-r,w=r*2,h=r*2,fill=fill,stroke=stroke,sw=sw,name='원형 표시')
    def button(self,x,y,w,label,variant='primary',h=46):
        self.node('button',x=x,y=y,w=w,h=h,value=label,variant=variant,name=label)
    def chevron(self,x,y): self.node('path',x=x,y=y,w=12,h=12,d='M4 2L8 6L4 10',stroke='muted',fill=None,sw=1.4,name='이동')
    def image(self,x,y,w,h):self.node('image',x=x,y=y,w=w,h=h,name='기차 창밖 여름 들판')
    def barcode(self,x,y,w=170,h=26):
        widths=[2,1,3,1,1,2,4,1,2,1,3,2]*4
        total=sum(widths)+len(widths)*1.2; pos=0
        for v in widths:
            self.rect(x+pos/total*w,y,v/total*w,h,'ink',name='장식 바코드');pos+=v+1.2
    def header(self,step):
        self.rect(0,0,self.w,self.h,'paper',name='앱 배경')
        self.rect(20,23,11,25,'ink',4,name='약속행 심볼');self.rect(23,28,5,7,'accent',2)
        self.text(38,24,'약속행',17,weight=700,w=180)
        self.circle(354,35,17,'white','line');self.text(339,24,'⋯',17,w=30,align='center')
        xs=[36,143,250,357]
        self.line(xs[0],77,xs[-1],77,'line',2)
        if step:self.line(xs[0],77,xs[step],77,'accent',2)
        for i,(x,t) in enumerate(zip(xs,['설정','초대','투표','확정'])):
            self.circle(x,77,4,'accent' if i<=step else 'paper',None if i<=step else 'line')
            self.text(x-23,89,t,10,'ink' if i==step else 'muted',700 if i==step else 400,46,'center')
    def kicker(self,label): self.text(20,124,label,9,'accent',700,tracking=1.4)
    def ticket_base(self,x,y,w,h,title):
        self.rect(x,y+5,w,h,'subtle',18,name='티켓 그림자')
        self.rect(x,y,w,h,'white',16,name=title)
        self.rect(x,y,w,43,'accent',16,name='티켓 띠')
        self.rect(x,y+24,w,19,'accent')
        self.circle(x,y+43,5,'paper');self.circle(x+w,y+43,5,'paper')
    def mini_ticket(self):
        x,y,w=20,218,353
        self.ticket_base(x,y,w,160,'설정 미리보기 티켓')
        self.text(36,y+14,'PREVIEW · 설정 미리보기',9,'white',700,tracking=1.1)
        self.text(282,y+14,'NO. 1123',8,'white',w=76,align='right')
        self.line(295,y+43,295,y+160,'line',1,True)
        self.text(38,y+60,'FROM',8,'muted',700,tracking=1.5)
        self.text(183,y+60,'TO',8,'muted',700,tracking=1.5)
        self.text(36,y+78,'11.15',28,weight=700,w=100)
        self.text(145,y+85,'→',22,'accent',w=35)
        self.text(182,y+78,'12.15',28,weight=700,w=105)
        self.text(36,y+126,'2026     매일 09–24시 · 2시간',10,'muted',w=240)
        self.text(306,y+63,'정원',9,'muted',w=54,align='center')
        self.text(306,y+84,'5',32,weight=700,w=54,align='center')
        self.text(306,y+129,'방장 포함',8,'muted',w=54,align='center')

def setup(theme):
    c=Canvas(theme,'01 · 약속 설정');c.header(0);c.kicker('STEP 1 · 약속 설정')
    c.text(20,144,'언제, 몇 명이서\n만날까요?',26,weight=700)
    c.mini_ticket();c.rect(20,400,353,250,'white',16,name='설정 입력 목록')
    rows=[('약속 날짜','11.15 → 12.15'),('하루 시간 범위','09:00–24:00'),('소요 시간','2시간'),('정원 (방장 포함)','5명'),('응답 마감','11.22 (일) 23:59')]
    for i,(label,value) in enumerate(rows):
        y=400+i*50
        c.text(36,y+17,label,12,'muted',w=150)
        if i in (2,3):
            c.circle(263,y+25,12,'paper');c.text(253,y+13,'−',16,w=20,align='center')
            c.text(278,y+16,value,13,weight=700,w=45,align='center')
            c.circle(340,y+25,12,'paper');c.text(330,y+13,'+',16,w=20,align='center')
        else:c.text(182,y+17,value,12,weight=700,w=161,align='right');c.chevron(349,y+19)
        if i<4:c.line(36,y+50,357,y+50)
    c.text(24,671,'날짜와 시간을 확인한 뒤 모집을 시작해 주세요.\n초안은 방장 등록 후 10분 동안 유지돼요.',11,'muted')
    c.button(20,780,353,'모집 시작하고 초대 링크 받기  →')
    return c

def invite(theme):
    c=Canvas(theme,'02 · 초대 링크');c.header(1);c.kicker('STEP 2 · 친구 초대')
    c.text(20,145,'초대 링크가 준비됐어요',25,weight=700)
    c.text(20,184,'친구에게 링크를 보내 가능 시간을 받아요.',12,'muted')
    c.ticket_base(20,218,353,350,'초대 티켓');c.text(38,229,'INVITATION · 초대 티켓',9,'white',700,tracking=1.2)
    c.text(38,268,'혜승님의 약속',25,weight=700)
    c.rect(290,272,65,25,'soft',13);c.text(295,279,'● 모집 중',9,'accent',700,55,'center')
    c.text(38,317,'FROM',8,'muted',700,tracking=1.4);c.text(210,317,'TO',8,'muted',700,tracking=1.4)
    c.text(38,335,'11.15',31,weight=700,w=123);c.text(170,339,'→',26,'accent',w=40);c.text(210,335,'12.15',31,weight=700,w=140)
    c.line(38,386,355,386)
    for x,y,label,value in [(38,404,'하루 시간','09:00–24:00'),(210,404,'소요 시간','2시간'),(38,460,'정원','나 포함 5명'),(210,460,'응답 마감','11.22 23:59')]:
        c.text(x,y,label,9,'muted',w=140);c.text(x,y+19,value,14,weight=700,w=145)
    c.line(20,516,373,516,'line',1,True);c.circle(20,516,7,'paper');c.circle(373,516,7,'paper')
    c.text(38,531,'SEE YOU SOON',9,'accent',700,tracking=1.4);c.text(38,548,'함께 만날 시간을 정해요',9,'muted',w=175);c.barcode(236,532,118,21)
    c.rect(20,592,353,49,'white',25,name='초대 링크');c.text(37,610,'yaksok.app/p/…',12,'muted',w=235);c.button(289,599,76,'복사','primary',35)
    c.text(25,664,'초대 링크로 들어온 친구는 닉네임과 PIN을\n등록한 뒤 참여할 수 있어요.',11,'muted')
    c.button(20,780,151,'공유하기  ↗','secondary');c.button(181,780,192,'내 시간 고르기  →')
    return c

def availability(theme):
    c=Canvas(theme,'03 · 가능 시간');c.header(2);c.kicker('STEP 3 · 시간 투표')
    c.text(20,145,'가능한 시간을 골라주세요',23,weight=700)
    c.text(20,179,'드래그해서 선택 · 왼쪽 시간대를 밀어 스크롤',10,'muted')
    c.rect(20,203,353,38,'subtle',20,name='시간 보기 탭');c.rect(22,205,175,34,'white',18,'line');c.text(33,215,'내 시간',12,weight=700,w=153,align='center');c.text(201,215,'전체 시간 · 4명',12,'muted',w=163,align='center')
    c.text(22,260,'‹',24,w=25);c.text(58,264,'2026 · 11.22–11.28',14,weight=700,w=277,align='center');c.text(351,260,'›',24,w=25)
    c.button(20,302,69,'↶','secondary',32);c.button(96,302,69,'↷','secondary',32)
    c.rect(202,302,171,32,'subtle',16);c.rect(259,304,56,28,'white',14);c.text(202,313,'30분',10,'muted',w=57,align='center');c.text(259,313,'1시간',10,'accent',700,57,'center');c.text(316,313,'2시간',10,'muted',w=57,align='center')
    for d,(day,num) in enumerate(zip('일월화수목금토',range(22,29))):
        x=53+d*45
        c.text(x,350,day,9,'muted',w=40,align='center');c.text(x,365,str(num),12,weight=700,w=40,align='center')
    selected={(1,1),(1,2),(1,3),(2,3),(2,4),(3,5),(3,6),(4,4),(4,5),(4,6),(5,1),(5,2)}
    for j in range(9):
        y=390+j*36;c.text(20,y+10,str(j+9).zfill(2),9,'muted',w=28)
        for d in range(7):
            x=53+d*45;is_sel=(d,j) in selected
            c.node('slot',x=x,y=y,w=40,h=31,value='✓' if is_sel else '',variant='selected' if is_sel else 'disabled' if d==0 else 'empty',name=f'{22+d}일 {9+j}시')
    c.text(20,723,'■ 선택    ▧ 선택 불가    ↓ 이후 시간',9,'muted')
    c.button(20,744,108,'↶ 이번 주 반복','secondary',32);c.button(137,744,81,'초기화','secondary',32)
    c.rect(0,792,393,60,'ink',name='고정 제출바');c.text(20,805,'12칸 · 12시간 선택',12,'white',700,w=220);c.text(20,825,'선택 제출을 눌러야 저장돼요',9,'white',w=220);c.button(276,802,97,'선택 제출','primary',38)
    return c

def candidates(theme):
    c=Canvas(theme,'04 · 시간 후보');c.header(2);c.kicker('STEP 3 · 시간 후보')
    c.rect(293,124,80,24,'ink',12);c.text(296,131,'● 응답 마감',9,'white',700,74,'center')
    c.text(20,149,'함께 만날 수 있는\n시간이에요',26,weight=700)
    c.text(20,224,'전체 기간에서 함께 가능한 인원이 많은 순서예요.',11,'muted')
    c.text(20,261,'함께 가능한 인원 · 소요 2시간',10,'muted',w=245);c.text(279,261,'응답 시간표 ↗',10,weight=700,w=94,align='right')
    for i,(day,time,count) in enumerate([('11.23 (월)','13:00 → 15:00',4),('11.25 (수)','15:00 → 17:00',4),('11.27 (금)','10:00 → 12:00',3),('11.30 (월)','14:00 → 16:00',3)]):
        y=286+i*88;c.rect(20,y,353,76,'white',17,'accent' if i==0 else 'line',2 if i==0 else 1,name=f'후보 {i+1}')
        c.circle(50,y+38,15,'accent' if i==0 else 'soft');c.text(37,y+27,str(i+1),14,'white' if i==0 else 'accent',700,26,'center')
        c.text(78,y+15,day,11,'muted',w=210);c.text(78,y+34,time,19,weight=700,w=220)
        c.rect(310,y+26,46,25,'soft' if i<2 else 'subtle',13);c.text(314,y+33,f'{count}/4명',10,'accent' if i<2 else 'muted',700,38,'center')
    c.text(20,661,'후보를 고른 뒤 확인창에서 확정해 주세요.',11,'muted',w=353,align='center')
    c.button(20,744,353,'11.23 (월) 13:00으로 확정  ✓');c.text(20,807,'설정 변경 · 재조율',12,'muted',w=353,align='center')
    return c

def result(theme):
    c=Canvas(theme,'05 · 확정 티켓');c.header(3)
    c.rect(20,128,353,531,'white',17,name='확정 티켓');c.image(20,128,353,174)
    c.rect(20,241,353,61,'ink');c.nodes[-1]['opacity']=.4
    c.text(38,146,'YAKSOK / MEETING PASS',8,'white',700,tracking=1.4)
    c.text(38,253,'SEE YOU SOON',27,'white',700)
    c.node('path',x=20,y=292,w=353,h=15,d='M0 15L0 8L76 8L121 0L150 9L205 1L255 10L310 4L353 10L353 15Z',fill='white',stroke=None,sw=0,name='티켓 절취선')
    c.text(38,326,'BOARDING PASS · 약속행',8,'accent',700,tracking=1.5);c.text(275,327,'NO. 1123–1300',8,'muted',w=80,align='right')
    c.text(38,362,'약속 날짜',10,'muted');c.text(38,382,'2026년 11월 23일 월요일',19,weight=700)
    c.text(38,425,'약속 시간',10,'muted');c.text(38,445,'13:00 → 15:00',29,'accent',700,w=270)
    c.circle(326,449,29,'white','accent',1.4);c.circle(326,449,25,'white','accent',.7);c.text(300,432,'MEETING',7,'accent',700,52,'center');c.text(300,443,'확정',14,'accent',700,52,'center');c.text(300,462,'CONFIRMED',6,'accent',700,52,'center')
    c.text(38,498,'소요 시간',9,'muted',w=160);c.text(215,498,'참석 인원',9,'muted',w=140);c.text(38,517,'2시간',16,weight=700,w=160);c.text(215,517,'4명 전원',16,weight=700,w=140)
    c.line(20,556,373,556,'line',1,True);c.circle(20,556,7,'paper');c.circle(373,556,7,'paper')
    for i,n in enumerate(['혜승','민수','지수','준호']):c.rect(38+i*54,574,45,27,'subtle',14);c.text(38+i*54,581,n,10,weight=700,w=45,align='center')
    c.barcode(38,616,195,25);c.text(277,617,'ONLY FOR\nPARTICIPANTS',7,'muted',w=78,align='right',tracking=1)
    c.text(24,687,'이 약속에 참여한 사람만\n로그인 후 결과를 볼 수 있어요.',11,'muted')
    c.text(20,739,'참여자 · 나가기       재조율하기',11,'muted',w=353,align='center')
    c.button(20,780,150,'참여 정보 보기','secondary');c.button(180,780,193,'결과 링크 복사  ↗')
    return c

NOTES=[
 ('약속 설정','날짜·시간·소요 시간·정원·마감을 요약 행으로 편집.','입력 규칙은 유지하고, 상세 편집은 별도 패널로 여는 제안.','모집 시작 전 서버 검증 · 초안 10분 · 정원 2~30명'),
 ('초대 링크','초대 티켓과 링크 복사, 가능 시간 입력 진입.','기본 공유 시트·복사로 연결. 카카오 연동을 뜻하지 않음.','설정 요약 · 복사 성공/실패 · 닉네임·PIN 참여 안내'),
 ('가능 시간','1시간 기본 보기, 드래그, 주 반복·초기화·되돌리기.','시간표만 내부 스크롤하고 하단 제출바는 고정.','30분 단위 저장 · 명시적 제출 · 전체/개인 시간 비교'),
 ('시간 후보','후보 선택을 강조하고 하단 확정 버튼으로 연결.','확정 전 확인창 유지. 일반 참여자에게 확정 버튼 없음.','소요 시간 전체 공통 2명 이상 · 인원↓/시작 시간↑ 정렬'),
 ('확정 티켓','기차 사진·절취선·도장·참석자·결과 링크 복사.','공유 결과는 참여자 로그인 후에만 공개.','복사 실패 시 수동 복사 · 방장만 재조율 · 도장 모션 유지'),
]

def components(theme):
    c=Canvas(theme,'구성요소',1100,640);c.rect(0,0,1100,640,'paper');c.text(32,26,'구성요소 / '+('RED' if theme=='red' else 'BLUE'),24,weight=700,w=1036)
    c.text(32,75,'01  색상',12,'muted',700)
    for i,key in enumerate(['accent','soft','paper','ink','line']):
        x=32+i*120;c.rect(x,104,94,54,key,10,'line' if key in ['paper','white'] else None);c.text(x,169,key,11,'muted',w=100);c.text(x,189,c.colors[key],11,weight=700,w=100)
    c.text(32,245,'02  버튼',12,'muted',700);c.button(32,275,216,'모집 시작  →');c.button(266,275,216,'공유하기  ↗','secondary');c.button(500,275,216,'처리 중…','disabled')
    c.text(32,362,'03  시간 칸',12,'muted',700)
    for i,(v,lab) in enumerate([('empty','선택 전'),('selected','선택'),('disabled','범위 밖'),('partial','일부 선택')]):
        x=32+i*105;c.node('slot',x=x,y=393,w=80,h=42,value='✓' if v=='selected' else '일부' if v=='partial' else '',variant=v,name=lab);c.text(x,446,lab,11,'muted',w=80,align='center')
    c.text(533,362,'04  전체 시간 히트맵',12,'muted',700,w=400)
    for i,k in enumerate(['white','soft','mid','accent','deep']):c.rect(533+i*50,393,50,18,k,0,'line')
    c.text(533,421,'0명',10,'muted',w=80);c.text(713,421,'전체 인원',10,'muted',w=70,align='right')
    c.text(533,452,'색 칸을 누르는 동안 닉네임만 표시',11,'muted',w=450)
    c.text(32,520,'05  디자인 기준',12,'muted',700)
    c.text(32,550,'따뜻한 종이 배경 · 검정 본문 · 한 가지 포인트색 · 둥근 입력 칸 · 절취선 티켓',14,w=1020)
    c.text(32,581,'취소·탈퇴는 명확한 문구와 확인창으로 구분. 포인트색만으로 위험 동작을 표현하지 않음.',12,'muted',w=1020)
    return c

def color(c,k):return c.colors.get(k,k) if k else 'none'

def svg_node(c,n):
    t=n['type'];x=n.get('x',0);y=n.get('y',0);w=n.get('w',0);h=n.get('h',0)
    stroke=color(c,n.get('stroke'));fill=color(c,n.get('fill'));sw=n.get('sw',1)
    op=f' opacity="{n["opacity"]}"' if 'opacity' in n else ''
    if t=='rect':return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{n.get("radius",0)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{op}/>'
    if t=='circle':return f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    if t=='path':return f'<path transform="translate({x},{y})" d="{n["d"]}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'+(' stroke-dasharray="3 4"' if n.get('dashed') else '')+'/>'
    if t=='image':return f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,{PHOTO64}"/>'
    if t=='text':
        align=n.get('align','left');tx=x+(w/2 if align=='center' else w if align=='right' else 0);anchor={'left':'start','center':'middle','right':'end'}[align]
        return ''.join(f'<text x="{tx}" y="{y+n["size"]+i*n["size"]*1.45}" font-size="{n["size"]}" font-weight="{n["weight"]}" fill="{color(c,n["color"])}" text-anchor="{anchor}" letter-spacing="{n.get("tracking",0)}">{html.escape(s)}</text>' for i,s in enumerate(n['value'].split('\n')))
    if t in ('button','slot'):
        v=n['variant'];bg='accent' if v in ('primary','selected') else 'soft' if v=='partial' else 'subtle' if v in ('disabled',) else 'white';fg='white' if v in ('primary','selected') else 'muted' if v=='disabled' else 'accent' if v=='partial' else 'ink'
        border='ink' if v=='secondary' and t=='button' else 'line' if v=='empty' else None
        rr=svg_node(c,dict(type='rect',x=x,y=y,w=w,h=h,fill=bg,radius=h/2 if t=='button' else 8,stroke=border,sw=1))
        size=13 if t=='button' and w>90 else 11
        return rr+svg_node(c,dict(type='text',x=x+6,y=y+(h-size*1.45)/2-1,w=w-12,h=20,value=n['value'],size=size,weight=700,color=fg,align='center'))
    raise ValueError(t)

def svg(c):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{c.w}" height="{c.h}" viewBox="0 0 {c.w} {c.h}" role="img" aria-label="{html.escape(c.name)}"><g font-family="Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif">'+''.join(svg_node(c,n) for n in c.nodes)+'</g></svg>'

def main():
    screens=[];sheets=[]
    for theme in THEMES:
        for i,fn in enumerate([setup,invite,availability,candidates,result]):
            c=fn(theme);(ROOT/f'{theme}-{i+1:02}.svg').write_text(svg(c));screens.append(dict(theme=theme,name=c.name,w=c.w,h=c.h,nodes=c.nodes,notes=NOTES[i]))
        c=components(theme);(ROOT/f'{theme}-components.svg').write_text(svg(c));sheets.append(dict(theme=theme,name=c.name,w=c.w,h=c.h,nodes=c.nodes))
    payload={'colors':{k:COMMON|v for k,v in THEMES.items()},'screens':screens,'sheets':sheets,'image':PHOTO64}
    (ROOT/'figma-data.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
    for c in screens+sheets:
        for n in c['nodes']:
            assert n.get('x',0)>=0 and n.get('y',0)>=0
            if n['type'] not in ('path',):assert n['x']+n['w']<=c['w']+1 and n['y']+n['h']<=c['h']+1,(c['name'],n)
    print('Generated 10 screens + 2 component sheets; geometry validated.')

if __name__=='__main__':main()
