#!/usr/bin/env python3
"""Renders out/report.json into out/REPORT.md: counts and the case table. The narrative sections come from
report_notes.md (written by hand after a run) and are appended unchanged."""
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, 'out', 'report.json')))
cnt = collections.Counter(r['result'] for r in rows)
esc = lambda s: str(s).replace('|', '\\|').replace('\n', ' ')[:260]
out = ['# Delivery tracking end-to-end report', '',
       '**Totals:** %d steps: %d PASS, %d FAIL, %d BLOCKED.' % (len(rows), cnt['PASS'], cnt['FAIL'], cnt['BLOCKED']), '',
       '| case | PASS | FAIL | BLOCKED |', '|---|---|---|---|']
per = collections.defaultdict(collections.Counter)
for r in rows: per[int(r['case'])][r['result']] += 1
for k in sorted(per): out.append('| %d | %d | %d | %d |' % (k, per[k]['PASS'], per[k]['FAIL'], per[k]['BLOCKED']))
notes = os.path.join(HERE, 'report_notes.md')
if os.path.exists(notes): out += ['', open(notes).read()]
out += ['', '## Case table', '', '| case | step | expected | observed | result | evidence |', '|---|---|---|---|---|---|']
for r in sorted(rows, key=lambda r: int(r['case'])):
    out.append('| %s | %s | %s | %s | %s | %s |' % (r['case'], esc(r['step']), esc(r['expected']), esc(r['observed']), r['result'], esc(r['evidence'])))
open(os.path.join(HERE, 'out', 'REPORT.md'), 'w').write('\n'.join(out) + '\n')
print('wrote out/REPORT.md')
