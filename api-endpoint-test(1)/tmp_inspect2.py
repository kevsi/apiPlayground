from pathlib import Path
path = Path('lib/project-analyzer.ts')
text = path.read_text(encoding='utf-8')
idx = text.find('const ROUTE_RE = /@(?:[A-Za-z_][\\w.]*)\\.(route|add_url_rule)')
print('IDX', idx)
if idx >= 0:
    line = text[idx:text.index('\n', idx)+1]
    print(repr(line))
else:
    print('not found')
