import { cp, mkdir, readFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Next traces the web server, not the release-job CLI. Include Prisma's complete
// locked runtime dependency tree (including @prisma/config's transitive packages).
const root = process.cwd();
const modules = path.join(root, "node_modules");
const output = path.join(root, ".next", "standalone", "node_modules");
const visited = new Set();
async function locate(name, from) {
  const require = createRequire(path.join(from, "package.json"));
  for (const directory of require.resolve.paths(name) ?? []) {
    const candidate = path.join(directory, name);
    try { await access(path.join(candidate, "package.json")); return candidate; } catch { /* try the next Node resolution path */ }
  }
  throw new Error(`Missing release-job dependency: ${name}`);
}
async function copyDependency(name, from) {
  const source = await locate(name, from);
  if (visited.has(source)) return;
  visited.add(source);
  const relative = path.relative(modules, source);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Dependency outside node_modules: ${name}`);
  const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (dependency in (manifest.optionalDependencies ?? {})) {
      try { await locate(dependency, source); } catch { continue; }
    }
    await copyDependency(dependency, source);
  }
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    try { await locate(dependency, source); } catch { continue; }
    await copyDependency(dependency, source);
  }
}
await copyDependency("prisma", root);
console.log(`Prepared Prisma release runtime (${visited.size} packages).`);
