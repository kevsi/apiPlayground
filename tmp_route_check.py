import pathlib
import re
root = pathlib.Path(r"c:\Users\rough\Documents\Workspace\apiPlayground\simple-api")
ignored = {"node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv", "vendor"}
files = [str(p) for p in root.rglob("*") if p.is_file() and not p.name.startswith('.') and not any(part in ignored for part in p.parts)]
all_text = "\n".join(open(f, "r", encoding="utf8").read() for f in files)
framework = "unknown"
if re.search(r"require\s*\(\s*['\"]express['\"]\s*\)", all_text):
    framework = "express"
elif re.search(r"express\s*\(\s*\)", all_text):
    framework = "express"
elif re.search(r"from\s+fastapi\s+import", all_text):
    framework = "fastapi"
elif re.search(r"FastAPI\s*\(", all_text):
    framework = "fastapi"
print("framework", framework, "files", len(files))
patterns = [
    re.compile(r"@router\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"\s][^'\"\)]*)['\"]"),
    re.compile(r"@app\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"\s][^'\"\)]*)['\"]"),
]
total = []
for f in files:
    content = open(f, "r", encoding="utf8").read()
    for p in patterns:
        for m in p.finditer(content):
            total.append((m.group(1), m.group(2), f))
print("total", len(total))
for item in total:
    print(item)
