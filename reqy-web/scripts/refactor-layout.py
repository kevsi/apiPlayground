#!/usr/bin/env python3
"""One-shot refactor: move sidebar/header/wrapper out of each page so (app)/layout.tsx owns them."""

import os
import re
import sys

ROOT = os.path.join(os.getcwd(), "app", "(app)")
PAGES = [
    "page.tsx",
    "dashboard/page.tsx",
    "collections/page.tsx",
    "mocks/page.tsx",
    "settings/page.tsx",
    "runner/page.tsx",
    "ai-insights/page.tsx",
    "documentation/page.tsx",
    "workspaces/page.tsx",
    "graphql/page.tsx",
    "my-projects/page.tsx",
    "sdks/page.tsx",
]

# Matches the opening of the wrapper: outer div + ApiSidebar + inner div + ApiHeader.
# Captures everything from the outer div opening through ApiHeader so we can drop it.
WRAPPER_OPEN = re.compile(
    r'    <div className="flex (?:h-screen|min-h-screen) bg-background(?: bg-dot-pattern)?">\s*\n'
    r'\s*<ApiSidebar[^>]*?/>\s*\n'
    r'\s*\n?'
    r'\s*<div className=\{cn\(\s*\n'
    r'[\s\S]*?'
    r'\)\}>\s*\n'
    r'\s*<ApiHeader\s*/>\s*\n'
    r'\s*\n?'
)

# Matches the closing of the wrapper: inner div close + outer div close + return close.
WRAPPER_CLOSE = re.compile(
    r'\n\s*</div>\s*\n\s*</div>\s*\n\s*\)\s*\n\s*\}\s*$'
)


def refactor(path):
    with open(path, "r", encoding="utf-8") as f:
        original = f.read()
    content = original

    # 1. Remove unused imports
    content = re.sub(r'import \{ ApiSidebar \} from "@/components/api-sidebar"\n', "", content)
    content = re.sub(r'import \{ ApiHeader \} from "@/components/api-header"\n', "", content)
    content = re.sub(r'import \{ useSidebar \} from "@/contexts/sidebar-context"\n', "", content)

    # 2. Remove useSidebar hook if its destructured names aren't used elsewhere
    hook_re = re.compile(r'  const \{ isCollapsed, toggleSidebar \} = useSidebar\(\)\n')
    if hook_re.search(content):
        candidate = hook_re.sub("", content)
        if "isCollapsed" not in candidate and "toggleSidebar" not in candidate:
            content = candidate

    # 3. Replace wrapper opening
    content = WRAPPER_OPEN.sub("", content)

    # 4. Replace wrapper closing: only match at the END of the last return statement.
    content = WRAPPER_CLOSE.sub("\n)", content)

    if content == original:
        return False, 0

    before_lines = original.count("\n")
    after_lines = content.count("\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True, before_lines - after_lines


def main():
    # Script lives at reqy-web/scripts/refactor-layout.py.
    # Use sys.argv[0] (always absolute when invoked with an absolute path)
    # then walk up to reqy-web/.
    script_path = os.path.realpath(sys.argv[0])
    script_dir = os.path.dirname(script_path)
    reqy_web_dir = os.path.dirname(script_dir)
    root = os.path.join(reqy_web_dir, "app", "(app)")
    changed = 0
    for rel in PAGES:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print(f"SKIP (not found): {path}")
            continue
        ok, diff = refactor(path)
        if ok:
            changed += 1
            print(f"OK   {rel} (-{diff} lines)")
        else:
            print(f"NOOP {rel}")
    print(f"\n{changed}/{len(PAGES)} pages refactored")


if __name__ == "__main__":
    main()
