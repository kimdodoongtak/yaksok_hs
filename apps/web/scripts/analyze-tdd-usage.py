"""Read-only log attribution; output metadata/counts only, never raw chat or commands."""
from pathlib import Path
from collections import Counter
import json, re

ROOT=Path(__file__).resolve().parents[3]
LOGROOT=Path.home()/'.codex/sessions'
CUTOFF='2026-11-15T04:21:18' # include the full second used in the original report
KEYS=('input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens')
STR=r'''("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)'''
TESTPATH=re.compile(r'(?:[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?|(?:apps/web/)?e2e/[\w./-]+|(?:apps/web/)?(?:scripts/[^\s\x22\x27]*test[^\s\x22\x27]*|vitest[^\s\x22\x27]*|playwright[^\s\x22\x27]*))')
PRODPATH=re.compile(r'(?:apps/web/)?(?:src|prisma)/[\w/.[\]-]+\.(?:tsx?|css|prisma|sql)')
TEST_RUN=re.compile(r'\b(?:npm\s+(?:run\s+)?test(?:\:[\w-]+)?\b|npx\s+(?:vitest|playwright)\b|vitest\s+run\b|playwright\s+test\b)')
QUALITY=re.compile(r'\bnpm\s+run\s+(?:lint|typecheck|build)\b')
DOC_PATH=re.compile(r'(?:context/tdd(?:/[^\s\x22\x27]+|\-policy\.md)|docs/tdd[^\s\x22\x27]*)')

def decode(s):
    if s.startswith('"'):
        try:return json.loads(s)
        except:pass
    return s[1:-1].replace('\\n','\n').replace('\\"','"').replace("\\'", "'").replace('\\\\','\\')

def clean_path(s):
    return s.replace(str(ROOT)+'/', '').strip().rstrip(';,')

def pathflags(path,writing=False):
    f=set()
    if TESTPATH.search(path):f.add('test_edit' if writing else 'test_read')
    elif path.startswith('context/tdd/') or path.startswith('docs/tdd'):f.add('tdd_record' if writing else 'tdd_record_read')
    elif PRODPATH.search(path):f.add('product_edit' if writing else 'product_read')
    return f

def commandflags(cmd):
    f=set();paths=set()
    # Do not count commands quoted inside Python/Node heredocs, patches or doc bodies as executions.
    header=cmd.split('\n',1)[0]
    body=cmd
    if '<<' in header: body=header
    if TEST_RUN.search(body):f.add('test_run')
    if QUALITY.search(body):f.add('quality_run')
    # Read commands are observable evidence. rg matching filenames is related inspection, not execution.
    read=bool(re.search(r'\b(?:cat|sed|rg|head|tail)\b',body))
    if read:
        for p in TESTPATH.findall(body):f.add('test_read');paths.add(clean_path(p))
        for p in PRODPATH.findall(body):
            if not TESTPATH.search(p):f.add('product_read')
        if DOC_PATH.search(body):f.add('tdd_record_read')
    # Explicit file-writing targets; avoid arbitrary paths mentioned in strings/documents.
    for m in re.finditer(r'\b(?:Path|writeFileSync|writeFile)\s*\(\s*'+STR,cmd):
        path=decode(m.group(1)); flags=pathflags(path,True)
        # Path() alone can also be a read. Require mutation in the script.
        if re.search(r'write_text|write_bytes|writeFile',cmd):f|=flags;paths.add(clean_path(path))
    for m in re.finditer(r'(?:\bcat\s*>\s*|\btee\s+)([^\s;]+)',body):
        p=m.group(1).strip('"\'');f|=pathflags(p,True);paths.add(clean_path(p))
    # Test bootstrap belongs to testing; package installation alone is not automatically TDD.
    if re.search(r'\b(?:npm\s+(?:install|i)|npm\s+add)\b',body) and re.search(r'vitest|@playwright/test',body):f.add('test_setup')
    return f,paths

def toolflags(p,processes):
    name=p.get('name','');s=p.get('input',p.get('arguments',''));f=set();paths=set()
    if not isinstance(s,str):s=json.dumps(s)
    # Actual patch file headers only. Decode escaped newlines first.
    plain=s.replace('\\n','\n')
    for m in re.finditer(r'^\*\*\* (?:Add|Update|Delete) File: ([^\n]+)',plain,re.M):
        path=clean_path(m.group(1));f|=pathflags(path,True);paths.add(path)
    if name.endswith('exec_command'):
        try:
            cmd=json.loads(s).get('cmd','');x,y=commandflags(cmd);f|=x;paths|=y
        except:pass
    else:
        for m in re.finditer(r'(?:\bcmd|"cmd"|\x27cmd\x27)\s*:\s*'+STR,s):
            x,y=commandflags(decode(m.group(1)));f|=x;paths|=y
    for m in re.finditer(r'(?:\bsession_id|"session_id")\s*:\s*(\d+)',s):
        f|=processes.get(m.group(1),set())
    return f,paths

def contenttext(p):
    return '\n'.join(c.get('text','') for c in p.get('content',[]) if isinstance(c,dict))

def category(flags):
    direct=bool(flags & {'test_edit','test_read','test_run','test_setup'})
    product=bool(flags & {'product_edit','product_read'})
    quality='quality_run' in flags
    if direct and (product or quality):return 'test_and_product_or_quality_mixed'
    if direct:return 'test_direct'
    if 'tdd_record' in flags:return 'tdd_documentation'
    if quality:return 'other_quality_checks'
    return 'other_or_unattributed'

seen=set();rows=[];sessions={};duplicates=0;record_mismatch=0;response_seen=set();token_records_total=Counter();seen_outputs=set()
for file in sorted(LOGROOT.rglob('*.jsonl')):
    with file.open() as stream:
        try:meta=json.loads(stream.readline())['payload']
        except:continue
        if meta.get('cwd')!=str(ROOT):continue
        kind='main' if meta.get('source') in ('vscode','cli') else 'approval_review' if isinstance(meta.get('source'),dict) and meta['source'].get('subagent',{}).get('other')=='guardian' else 'auxiliary'
        sid=meta['id'];session_scope='main' if kind=='main' else sid
        pending_out=set();pending_in=set();pending_paths=set();pending_messages=[];calls={};processes={};lastrec=None;model='unknown';turn=None;approval=set();started=False
        for lineno,line in enumerate(stream,2):
            try:r=json.loads(line)
            except:continue
            if r.get('timestamp','')[:19]>=CUTOFF:continue
            p=r.get('payload',{});t=r['type'];pt=p.get('type')
            if t=='turn_context':model=p.get('model',model);turn=p.get('turn_id',turn)
            if t=='response_item':
                if pt=='message' and p.get('role')=='user' and kind=='approval_review':
                    s=contenttext(p)
                    if '>>> APPROVAL REQUEST START' in s:
                        req=s.rsplit('>>> APPROVAL REQUEST START',1)[1]
                        try:
                            val=json.JSONDecoder().raw_decode(req[req.index('{'):])[0]
                            cmd=val.get('command',[]);cmd=cmd[-1] if isinstance(cmd,list) and cmd else str(cmd)
                            approval,_=commandflags(cmd)
                        except (ValueError,KeyError):approval=set()
                elif pt=='message' and p.get('role')=='assistant':
                    # Inspect only public messages, not private reasoning.
                    pending_messages.append(contenttext(p))
                elif pt in ('custom_tool_call','function_call'):
                    fs,paths=toolflags(p,processes);pending_out|=fs;pending_paths|=paths
                    calls[p.get('call_id')]=(fs,paths)
                elif pt in ('custom_tool_call_output','function_call_output'):
                    fs,paths=calls.get(p.get('call_id'),(set(),set()));pending_in|=fs;pending_paths|=paths
                    output=p.get('output','');output=output if isinstance(output,str) else json.dumps(output)
                    for match in re.finditer(r'["\\]*session_id["\\]*\s*:\s*(\d+)',output):processes[match.group(1)]=set(fs)
            elif t=='token_usage_record':
                lastrec={'response_id':p.get('response_id'),'usage':p['usage'],'out':pending_out.copy(),'in':pending_in.copy(),'paths':pending_paths.copy(),'messages':pending_messages.copy(),'turn':p.get('turn_id',turn),'model':model,'line':lineno,'approval':approval.copy()}
                pending_out.clear();pending_in.clear();pending_paths.clear();pending_messages=[]
            elif t=='event_msg' and pt=='token_count' and p.get('info'):
                info=p['info'];total=info['total_token_usage'];usage=info['last_token_usage']
                key=(session_scope,tuple(total.get(k,0) for k in KEYS))
                if key in seen:duplicates+=1;continue
                seen.add(key);sessions[sid]=kind
                matched=lastrec and all(lastrec['usage'].get(k,0)==usage.get(k,0) for k in KEYS)
                if matched:
                    rec=lastrec;flags=(rec['out']|rec['in']) if kind=='main' else rec['approval']
                else:
                    record_mismatch+=1;rec={'response_id':None,'out':set(),'in':set(),'paths':set(),'messages':[],'turn':turn,'model':model,'line':lineno,'approval':approval.copy()};flags=approval if kind=='approval_review' else set()
                # Marker is corroborating evidence only: not enough to count a response as testing.
                stage=bool(re.search(r'\b(?:RED|GREEN|REFACTOR)\b','\n'.join(rec['messages'])))
                row={'timestamp':r['timestamp'],'session':sid,'source':kind,'log_file':file.name,'line':lineno,'response_id':rec['response_id'],'model':rec['model'],'turn':rec['turn'],'category':category(flags),'flags':sorted(flags),'outgoing_flags':sorted(rec['out']),'incoming_flags':sorted(rec['in']),'red_green_public_marker':stage,'usage_record_matched':bool(matched),'paths':sorted(rec['paths'])}
                row.update({k:usage.get(k,0) for k in KEYS});row['uncached_input_tokens']=usage['input_tokens']-usage.get('cached_input_tokens',0);row['uncached_input_plus_output_tokens']=row['uncached_input_tokens']+usage['output_tokens']
                rows.append(row)

def aggregate(items):
    s=Counter()
    for r in items:
        for k in (*KEYS,'uncached_input_tokens','uncached_input_plus_output_tokens'):s[k]+=r[k]
    s['responses']=len(items)
    return dict(s)

summary={'scope':{'project':str(ROOT),'cutoff_inclusive_second':'2026-11-15T13:21:17+09:00','basis':'previous 009 development snapshot; no later UI or this audit'},'sessions':dict(Counter(sessions.values())),'unique_events':len(rows),'duplicates_removed':duplicates,'usage_record_unmatched':record_mismatch,'totals':aggregate(rows),'by_source':{},'by_category':{},'method':{'unit':'unique model response usage event; full prompt context included','dedupe':'main cumulative usage tuple globally; approval review tuple within each session','attribution':'outgoing test file edits/reads/test commands plus the immediately following response consuming those tool results; mixed product and quality-check actions separate','approval_review':'exact planned command only; inherited conversation never used to classify','limitations':['Testing includes regression and tests added after implementation; not a pure TDD-only figure.','Cannot infer incremental overhead versus a no-TDD run.','An attributed response includes all context, not just test code tokens.','A RED/GREEN phrase alone is not counted as test activity.']}}
for src in sorted(set(r['source'] for r in rows)):
    part=[r for r in rows if r['source']==src]
    summary['by_source'][src]={'total':aggregate(part),'categories':{c:aggregate([r for r in part if r['category']==c]) for c in sorted(set(r['category'] for r in part))}}
for cat in sorted(set(r['category'] for r in rows)):summary['by_category'][cat]=aggregate([r for r in rows if r['category']==cat])
expected=json.loads((ROOT/'docs/development-metrics.json').read_text())['measurements']['through_009_commit']['combined_tokens']
summary['original_snapshot_reconciliation']={k:{'expected':v,'actual':summary['totals'].get(k),'matches':summary['totals'].get(k)==v} for k,v in expected.items()}
assert all(v['matches'] for v in summary['original_snapshot_reconciliation'].values()),summary['original_snapshot_reconciliation']
Path('/tmp/yaksok-tdd-usage-rows.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
Path('/tmp/yaksok-tdd-usage-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
