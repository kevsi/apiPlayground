/**
 * Git FS wrapper using LightningFS for isomorphic-git in the browser.
 */

import LightningFS from "@isomorphic-git/lightning-fs"

const FS_NAME = "reqly-git-fs"
const FS_DIR = "/reqly-collections"

let fsInstance: LightningFS.PromisifiedFS | null = null

export function getGitFs(): LightningFS.PromisifiedFS {
  if (fsInstance) return fsInstance
  const fs = new LightningFS(FS_NAME) as unknown as { promises: LightningFS.PromisifiedFS }
  fsInstance = fs.promises
  return fsInstance
}

export function getGitDir(): string {
  return FS_DIR
}

export async function ensureDir(dirPath: string): Promise<void> {
  const fs = getGitFs()
  const parts = dirPath.split("/").filter(Boolean)
  let current = ""
  for (const part of parts) {
    current += "/" + part
    try {
      await fs.mkdir(current)
    } catch {
      // dir may already exist
    }
  }
}

export async function writeFile(relPath: string, content: string): Promise<void> {
  const fs = getGitFs()
  const fullPath = `${FS_DIR}/${relPath}`
  const dir = fullPath.split("/").slice(0, -1).join("/")
  await ensureDir(dir)
  await fs.writeFile(fullPath, content, "utf8")
}

export async function readFile(relPath: string): Promise<string> {
  const fs = getGitFs()
  const fullPath = `${FS_DIR}/${relPath}`
  return (await fs.readFile(fullPath, { encoding: "utf8" })) as string
}

export async function unlinkFile(relPath: string): Promise<void> {
  const fs = getGitFs()
  const fullPath = `${FS_DIR}/${relPath}`
  await fs.unlink(fullPath)
}

export async function readdir(relPath: string): Promise<string[]> {
  const fs = getGitFs()
  const fullPath = `${FS_DIR}/${relPath}`
  return (await fs.readdir(fullPath)) as string[]
}

export async function clearCollectionsDir(): Promise<void> {
  const fs = getGitFs()
  const collectionsDir = `${FS_DIR}/collections`
  try {
    const files = await fs.readdir(collectionsDir)
    for (const file of files) {
      await fs.unlink(`${collectionsDir}/${file}`)
    }
  } catch {
    // directory may not exist yet
  }
}

/**
 * Export collections to JSON files on the virtual FS so isomorphic-git can track them.
 */
export async function syncCollectionsToFs(
  collections: Array<{ id: string; name: string; [key: string]: unknown }>
): Promise<void> {
  await clearCollectionsDir()
  for (const col of collections) {
    const safeName = col.name.replace(/[^a-zA-Z0-9_-]/g, "_")
    await writeFile(`collections/${safeName}_${col.id}.json`, JSON.stringify(col, null, 2))
  }
}
