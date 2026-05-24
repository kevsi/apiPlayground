import pathlib
import re
root = pathlib.Path(r"c:\Users\rough\Documents\Workspace\apiPlayground")
ignored = {"node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv", "vendor"}
# Additional path patterns to ignore (workspace tools, virtualenvs, etc.)
ignored_path_fragments = ["api-endpoint-test(1)", "dist", "build"]
files = [str(p) for p in root.rglob("*") if p.is_file() and not p.name.startswith('.') and not any(part in ignored for part in p.parts) and not any(frag in str(p) for frag in ignored_path_fragments)]

# Read files but skip binary/unreadable files
texts = []
good_files = []
for f in files:
    try:
        with open(f, "r", encoding="utf8") as fh:
            texts.append(fh.read())
            good_files.append(f)
    except Exception:
        # skip binary or unreadable files
        continue
all_text = "\n".join(texts)
framework = "unknown"
if re.search(r"require\s*\(\s*['\"]express['\"]\s*\)", all_text):
    framework = "express"
elif re.search(r"express\s*\(\s*\)", all_text):
    framework = "express"
elif re.search(r"from\s+fastapi\s+import", all_text):
    framework = "fastapi"
elif re.search(r"FastAPI\s*\(", all_text):
    framework = "fastapi"
print("framework", framework, "files", len(good_files))
patterns = [
    re.compile(r"@router\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"\s][^'\"\)]*)['\"]"),
    re.compile(r"@app\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"\s][^'\"\)]*)['\"]"),
]
total = []
for f in good_files:
    content = open(f, "r", encoding="utf8").read()
    for p in patterns:
        for m in p.finditer(content):
            total.append((m.group(1), m.group(2), f))
print("total", len(total))
for item in total:
    print(item)
