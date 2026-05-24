from pathlib import Path
path = Path('lib/project-analyzer.ts')
text = path.read_text(encoding='utf-8')
old = r"""  const ROUTE_RE = /@(?:[A-Za-z_][\w.]*)\.(route|add_url_rule)\s*\(\s*['\"]([^'\"\s][^'\"]*)['\"]([\s\S]{0,300}?)(?=\n(?:def|class|\s*$))/g
"""
new = r"""  const ROUTE_RE = /@([A-Za-z_][\w.]*)\.(route|get|post|put|delete|patch)\s*\(\s*(['\"])([^'\"\s][^'\"]*)\3([\s\S]*?)(?=\n\s*@|\n\s*def\s|$))/g
"""
if old not in text:
    raise SystemExit('Old Flask route regex line not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('patched regex line')
