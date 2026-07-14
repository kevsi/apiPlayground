import JSZip from "jszip";

export interface SdkManifestInput {
  /** OpenAPI Generator id, e.g. "typescript-fetch", "python", "go". */
  generator: string;
  /** Human-friendly API/collection name used to derive package names. */
  apiName: string;
  /** Default server URL (baked into docs where relevant). */
  basePath?: string;
  /** Package version (default "1.0.0"). */
  version?: string;
}

/** Sanitize an arbitrary string into a safe, lowercase identifier. */
function slugify(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "api"
  );
}

function npmName(apiName: string): string {
  return `reqly-${slugify(apiName)}`;
}

function pythonName(apiName: string): string {
  return `reqly_${slugify(apiName).replace(/-/g, "_")}`;
}

/**
 * Produce build manifests (package.json, tsconfig.json, pyproject.toml, …)
 * for a generated SDK so it is usable out of the box. OpenAPI Generator does
 * not emit these for every target, so Reqly injects them.
 *
 * Pure and deterministic — safe to unit test without network or a real ZIP.
 */
export function buildSdkManifests(input: SdkManifestInput): Record<string, string> {
  const { generator, apiName, basePath, version = "1.0.0" } = input;
  const g = (generator || "").toLowerCase();

  if (g.startsWith("typescript")) {
    const pkg = {
      name: npmName(apiName),
      version,
      description: `TypeScript client generated from the Reqly '${apiName}' collection.`,
      type: "module" as const,
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      },
      files: ["dist"],
      scripts: {
        build: "tsc -p tsconfig.json",
        typecheck: "tsc -p tsconfig.json --noEmit",
      },
      license: "MIT",
      devDependencies: { typescript: "^5.0.0" },
    };
    const tsconfig = {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2020", "DOM"],
        declaration: true,
        outDir: "dist",
        rootDir: ".",
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
      },
      include: ["index.ts", "runtime.ts", "apis/**/*.ts", "models/**/*.ts"],
      exclude: ["node_modules", "dist"],
    };
    return {
      "package.json": JSON.stringify(pkg, null, 2) + "\n",
      "tsconfig.json": JSON.stringify(tsconfig, null, 2) + "\n",
    };
  }

  if (g === "python") {
    const name = pythonName(apiName);
    const toml = `[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "${name}"
version = "${version}"
description = "Python client generated from the Reqly '${apiName}' collection"
requires-python = ">=3.8"
dependencies = [
    "urllib3 >= 1.25.3",
    "certifi",
    "python-dateutil",
    "pydantic >= 2.0",
]
`;
    return { "pyproject.toml": toml };
  }

  if (g === "go") {
    const mod = `module github.com/reqly/${slugify(apiName)}

go 1.21

require (
\tgithub.com/antihax/optional v1.0.0
)
`;
    return { "go.mod": mod };
  }

  if (g === "rust") {
    const name = npmName(apiName);
    const cargo = `[package]
name = "${name}"
version = "${version}"
edition = "2021"
description = "Rust client generated from the Reqly '${apiName}' collection"
license = "MIT"

[dependencies]
reqwest = { version = "0.12", features = ["json", "multipart"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_repr = "0.1"
`;
    return { "Cargo.toml": cargo };
  }

  // Generic fallback: a README so the SDK is at least navigable.
  const readme = `# Reqly generated SDK — ${apiName}

Generator: ${generator}
${basePath ? `Default base path: ${basePath}\n` : ""}
This SDK was generated from a Reqly collection. Build instructions depend on
the target language (\`${generator}\`). Refer to the OpenAPI Generator docs for
'${generator}'.
`;
  return { "README.md": readme };
}

/**
 * Detect the common top-level directory the generator nested its files in
 * (some generators wrap output in a folder; typescript-fetch is flat).
 */
function detectBaseDir(zip: JSZip): string {
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (names.includes("index.ts")) return "";
  const nested = names.find((n) => /^[^/]+\/index\.ts$/.test(n));
  return nested ? nested.split("/")[0] + "/" : "";
}

/**
 * Merge build manifests into a generated SDK ZIP. Existing files are never
 * overwritten, so a generator-provided manifest is preserved.
 *
 * @returns the (possibly) enriched ZIP as bytes. Throws on malformed input —
 *          callers should fall back to the original bytes.
 */
export async function enrichZipWithManifests(
  buffer: ArrayBuffer,
  generator: string,
  apiName: string,
  basePath?: string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const base = detectBaseDir(zip);
  const manifests = buildSdkManifests({ generator, apiName, basePath });
  for (const [path, content] of Object.entries(manifests)) {
    const target = base + path;
    if (!zip.file(target)) {
      zip.file(target, content);
    }
  }
  return zip.generateAsync({ type: "uint8array" });
}
