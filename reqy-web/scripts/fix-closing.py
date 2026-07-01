#!/usr/bin/env python3
"""Fix orphan </div> tags left over from the refactor step.

The refactor script removed wrapper opening tags but some closing </div> tags
were left behind. This pass removes:
  1. </div> right after </main> (orphan close of the inner cn wrapper)
  2. </div> right before the final `)` and `}` (orphan close of the outer wrapper)
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.realpath(sys.argv[0]))
APP_DIR = os.path.join(os.path.dirname(ROOT), "app", "(app)")

PAGES = [
    "dashboard/page.tsx",
    "collections/page.tsx",
    "mocks/page.tsx",
    "settings/page.tsx",
    "runner/page.tsx",
    "ai-insights/page.tsx",
    "documentation/page.tsx",
    "workspaces/page.tsx",
    "graphql/page.tsx",
    "sdks/page.tsx",
]


def fix(path):
    with open(path, "r", encoding="utf-8") as f:
        original = f.read()
    content = original

    # Pattern 1: </main> followed by an orphan </div> (the cn wrapper's close)
    # Match `</main>\n      </div>` (or similar indentation) and remove the </div>
    content = re.sub(r"(</main>)\s*\n\s*</div>\s*\n", r"\1\n\n", content)

    # Pattern 2: orphan </div> right before the final `)` and `}`
    # Match `\n    </div>\n  )\n}` at the end and remove the </div>
    content = re.sub(r"\n\s*</div>\s*\n\s*\)\s*\n\s*\}\s*$", "\n  )\n}\n", content)

    if content == original:
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


fixed = 0
for rel in PAGES:
    p = os.path.join(APP_DIR, rel)
    if not os.path.exists(p):
        print(f"SKIP (missing): {rel}")
        continue
    if fix(p):
        fixed += 1
        print(f"OK   {rel}")
    else:
        print(f"NOOP {rel}")

print(f"\n{fixed}/{len(PAGES)} pages fixed")
