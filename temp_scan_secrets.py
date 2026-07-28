import os,re
patterns=[r'sk-[A-Za-z0-9]{10,}',r'AIza[0-9A-Za-z\-_]{20,}',r'ghp_[A-Za-z0-9]{20,}',r'github_pat_[A-Za-z0-9_]{20,}',r'PMAK-[A-Za-z0-9-]{20,}']
ignore_dirs={'node_modules','target','.git','.next','coverage','dist','build'}
for dirpath, dirnames, filenames in os.walk('.'):
    dirnames[:] = [d for d in dirnames if d not in ignore_dirs]
    for fn in filenames:
        if fn.endswith(('.png','.jpg','.jpeg','.gif','.webp','.pdf','.zip','.ico','.svg','.ttf','.woff','.woff2','.mp4','.mov','.mp3','.pyc','.sqlite','.db','.lock')):
            continue
        path=os.path.join(dirpath, fn)
        try:
            with open(path,'r',encoding='utf-8',errors='ignore') as f:
                text=f.read()
        except Exception:
            continue
        for i, line in enumerate(text.splitlines(),1):
            for pat in patterns:
                if re.search(pat, line):
                    print(f'{path}:{i}:{line.strip()}')
                    break
