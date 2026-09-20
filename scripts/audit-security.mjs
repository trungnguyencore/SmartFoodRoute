import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
function files(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)]);
}
const runtime = files("src").filter(p => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p) && !p.includes("tests"));
const built = files("dist").filter(p => /\.(js|html|css)$/.test(p));
const legacy = /@googlemaps|google\.maps\.|AdvancedMarkerElement|PlaceAutocompleteElement|DirectionsService|DistanceMatrix|VITE_GOOGLE|(?:maps|places|routes)\.googleapis\.com/;
let failures = 0;
for (const path of [...runtime, ...built, "package.json", "package-lock.json", ".env.example"]) {
  if (legacy.test(readFileSync(path, "utf8"))) { console.error("FAIL legacy runtime token in " + path); failures++; }
}
for (const path of built) {
  if (/GEOAPIFY_API_KEY|SUPABASE_ACCESS_TOKEN|DATABASE_PASSWORD|https:\/\/api\.geoapify\.com/.test(readFileSync(path, "utf8"))) {
    console.error("FAIL server-only dependency in build " + path); failures++;
  }
}
const privateText = existsSync("pass-key/1.txt") ? readFileSync("pass-key/1.txt", "utf8") : "";
const secrets = [
  privateText.match(/sbp_[a-zA-Z0-9]+/)?.[0],
  privateText.match(/password\s*:\s*([^\r\n]+)/i)?.[1]?.trim(),
  process.env.GEOAPIFY_API_KEY,
].filter(Boolean);
const source = [...files("src"), ...files("supabase/functions"), ...files("scripts"), ...built, "package.json", ".env.example", "README.md", "PROGRESS.md"];
for (const path of source) {
  const content = readFileSync(path, "utf8");
  if (secrets.some(secret => content.includes(secret))) { console.error("FAIL credential exposure in " + path); failures++; }
}
if (!readFileSync(".gitignore", "utf8").includes("pass-key/")) { console.error("FAIL credential directory is not ignored"); failures++; }
console.log(JSON.stringify({ runtimeFiles: runtime.length, buildFiles: built.length, privateValuesChecked: secrets.length, failures,
  note: "Known credentials and runtime/provider boundaries; not a proof against every possible secret." }));
process.exitCode = failures ? 1 : 0;
