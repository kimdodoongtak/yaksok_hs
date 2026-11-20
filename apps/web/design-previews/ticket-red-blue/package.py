"""Package the local review board and the editable Figma renderer."""
from pathlib import Path
import html, json, zipfile

root = Path(__file__).resolve().parent
data = json.loads((root/'figma-data.json').read_text())
sections = []
for theme in ['red', 'blue']:
    cards = []
    for i, screen in enumerate(s for s in data['screens'] if s['theme'] == theme):
        notes = screen['notes']
        cards.append(f'''<article><a class="screen" href="{theme}-{i+1:02}.svg" target="_blank" aria-label="{notes[0]} 크게 보기"><img src="{theme}-{i+1:02}.svg" width="393" height="852" alt="{notes[0]} 디자인 제안"></a><div class="notes"><h3>{i+1:02} / {notes[0]}</h3><p>{notes[1]}</p><p class="proposal">배치 제안 · {notes[2]}</p><p class="required">필수 기능 · {notes[3]}</p></div></article>''')
    name = 'VERMILION RED' if theme == 'red' else 'COBALT BLUE'
    subtitle = '티켓과 도장의 경쾌한 인상' if theme == 'red' else '시간표를 차분하게 정리하는 인상'
    sections.append(f'''<section data-theme="{theme}"><header class="theme-heading"><span class="dot {theme}"></span><h2>{name}</h2><p>{subtitle}</p></header><div class="screens">{''.join(cards)}</div><details><summary>버튼 · 시간 칸 · 색상 구성요소 보기</summary><img class="components" src="{theme}-components.svg" width="1100" height="640" alt="{name} 구성요소"></details></section>''')

page = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>약속행 · 티켓 디자인 비교</title><style>
*{box-sizing:border-box}body{margin:0;background:#e7e5e0;color:#181916;font-family:"Noto Sans KR","Apple SD Gothic Neo",sans-serif}main{max-width:1640px;margin:auto;padding:44px 32px 64px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:2px}h1{font-size:36px;letter-spacing:-1.4px;margin:14px 0}p{line-height:1.65}.intro{max-width:850px;font-size:14px;color:#615f58}.status{display:inline-block;font-size:11px;background:#faf9f5;border:1px solid #ccc7bd;padding:8px 12px;border-radius:6px}.controls{display:flex;align-items:center;gap:8px;margin:24px 0 36px;flex-wrap:wrap}button,.download{font:inherit;font-size:12px;border:1px solid #aaa69c;border-radius:24px;background:transparent;color:inherit;padding:10px 18px;cursor:pointer;text-decoration:none}button[aria-pressed=true]{background:#181916;border-color:#181916;color:white}.download{margin-left:auto}.theme-heading{display:flex;gap:10px;align-items:center;margin:36px 0 18px}.theme-heading h2{font-size:16px;letter-spacing:1px}.theme-heading p{font-size:12px;color:#747168;margin-left:8px}.dot{width:10px;height:10px;border-radius:50%}.dot.red{background:#e92520}.dot.blue{background:#315bdb}.screens{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px}.screen{display:block;background:#f4f1ea;box-shadow:0 5px 18px #24201812;transition:transform .15s}.screen:hover{transform:translateY(-3px)}.screen img{width:100%;height:auto;display:block}.notes{padding:12px 3px}h3{font-size:13px;margin:8px 0}.notes p{font-size:11px;margin:8px 0}.proposal{color:#747168}.required{padding-top:8px;border-top:1px solid #cec9bf}details{margin-top:12px;border-top:1px solid #c9c4b9;padding:18px 0}summary{cursor:pointer;font-size:12px;font-weight:700}.components{display:block;width:min(100%,1100px);height:auto;margin-top:16px}.footer{font-size:12px;color:#747168;margin-top:36px;line-height:1.8}section[hidden]{display:none}@media(max-width:1000px){main{padding:24px 18px}.screens{display:flex;overflow-x:auto;gap:20px;scroll-snap-type:x mandatory;padding-bottom:8px}.screens article{flex:0 0 300px;scroll-snap-align:start}.theme-heading{flex-wrap:wrap}.theme-heading p{width:100%;margin:0 0 8px}.download{margin-left:0}h1{font-size:28px}}
</style><main><div class="eyebrow">YAKSOK / DESIGN STUDY 02</div><h1>약속을 기다리는 티켓.</h1><p class="intro">보내준 레퍼런스를 바탕으로 같은 5개 화면을 빨강과 파랑으로 비교했어요. 따뜻한 종이색, 검정 본문, 짧은 설정 행과 절취선 티켓을 공통으로 사용합니다. 화면을 누르면 원본 크기로 볼 수 있어요.</p><span class="status">디자인 제안 · 실제 앱 미반영 · Figma 추가 대기</span><nav class="controls" aria-label="색상 비교"><button data-filter="all" aria-pressed="true">두 색상 비교</button><button data-filter="red" aria-pressed="false">빨강</button><button data-filter="blue" aria-pressed="false">파랑</button><a class="download" href="figma-import.zip" download>Figma용 파일 받기 ↓</a></nav>''' + ''.join(sections) + '''<div class="footer">393 × 852 기준 · 예시 날짜/참여자 · ‘약속행’은 참고 이미지에 따른 브랜드 제안입니다.<br>기존 Figma 파일의 도구 호출 한도로 직접 반영하지 못했습니다. ZIP에는 화면 SVG와 편집 가능한 레이어를 생성하는 스크립트가 들어 있습니다. 스크립트의 Figma 실행은 미검증입니다.</div></main><script>
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-theme]').forEach(section=>section.hidden=button.dataset.filter!=='all'&&section.dataset.theme!==button.dataset.filter)}));
</script></html>'''
(root/'index.html').write_text(page)
(root/'figma-code.js').write_text('const DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n'+(root/'figma-renderer.js').read_text())
with zipfile.ZipFile(root/'figma-import.zip','w',zipfile.ZIP_DEFLATED) as z:
    for pattern in ['*.svg', 'index.html', 'figma-code.js', '사용방법.txt']:
        for p in root.glob(pattern):z.write(p,p.name)
print('Packaged HTML preview, native layer renderer and SVGs.')
