import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildSdkManifests, enrichZipWithManifests } from "@/lib/openapi-gen/sdk-manifests";

describe("buildSdkManifests", () => {
  it("emits package.json + tsconfig.json for typescript-fetch", () => {
    const files = buildSdkManifests({ generator: "typescript-fetch", apiName: "General" });
    expect(files["package.json"]).toBeDefined();
    expect(files["tsconfig.json"]).toBeDefined();
  });

  it("produces a valid package.json with a slugged name", () => {
    const files = buildSdkManifests({ generator: "typescript-fetch", apiName: "My API v2!" });
    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.name).toBe("reqly-my-api-v2");
    expect(pkg.type).toBe("module");
    expect(pkg.devDependencies.typescript).toBeDefined();
  });

  it("tsconfig targets DOM lib + Bundler resolution (global fetch)", () => {
    const files = buildSdkManifests({ generator: "typescript-fetch", apiName: "General" });
    const tsconfig = JSON.parse(files["tsconfig.json"]);
    expect(tsconfig.compilerOptions.lib).toContain("DOM");
    expect(tsconfig.compilerOptions.moduleResolution).toBe("Bundler");
  });

  it("emits pyproject.toml for python", () => {
    const files = buildSdkManifests({ generator: "python", apiName: "General" });
    expect(files["pyproject.toml"]).toContain("[project]");
    expect(files["pyproject.toml"]).toContain("reqly_general");
  });

  it("emits go.mod for go", () => {
    const files = buildSdkManifests({ generator: "go", apiName: "General" });
    expect(files["go.mod"]).toContain("module github.com/reqly/general");
  });

  it("emits Cargo.toml for rust", () => {
    const files = buildSdkManifests({ generator: "rust", apiName: "General" });
    expect(files["Cargo.toml"]).toContain("[package]");
  });

  it("emits a README fallback for unsupported generators", () => {
    const files = buildSdkManifests({
      generator: "cobol",
      apiName: "General",
      basePath: "https://x.test",
    });
    expect(files["README.md"]).toContain("https://x.test");
  });
});

describe("enrichZipWithManifests", () => {
  it("injects package.json into a flat generated zip", async () => {
    const zip = new JSZip();
    zip.file("index.ts", "export {}");
    zip.file("runtime.ts", "// runtime");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const enriched = await enrichZipWithManifests(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "typescript-fetch",
      "General",
    );

    const out = await JSZip.loadAsync(enriched);
    expect(out.file("package.json")).toBeTruthy();
    expect(out.file("tsconfig.json")).toBeTruthy();
    // original files preserved
    expect(out.file("index.ts")).toBeTruthy();
  });

  it("does not overwrite a generator-provided package.json", async () => {
    const zip = new JSZip();
    zip.file("index.ts", "export {}");
    zip.file("package.json", JSON.stringify({ name: "generator-provided", version: "9.9.9" }));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const enriched = await enrichZipWithManifests(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "typescript-fetch",
      "General",
    );

    const out = await JSZip.loadAsync(enriched);
    const pkg = JSON.parse(await out.file("package.json")!.async("string"));
    expect(pkg.name).toBe("generator-provided");
    expect(pkg.version).toBe("9.9.9");
  });

  it("places manifests inside the generator's root folder when nested", async () => {
    const zip = new JSZip();
    zip.file("typescript-fetch-client/index.ts", "export {}");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const enriched = await enrichZipWithManifests(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "typescript-fetch",
      "General",
    );

    const out = await JSZip.loadAsync(enriched);
    expect(out.file("typescript-fetch-client/package.json")).toBeTruthy();
    expect(out.file("package.json")).toBeNull();
  });
});
