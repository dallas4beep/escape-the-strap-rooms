// Converts the dialogue review file (Markdown) into public/data/dialogue.json.
// Usage: node tools/dialogue_to_json.mjs strap-rooms-dialogue.md public/data/dialogue.json
import fs from "fs";

const [src, dst] = process.argv.slice(2);
const lines = fs.readFileSync(src, "utf8").split("\n");
const out = { named: {}, primary: [], djLeft: [], djRight: [], crowd: [], accost: [] };
let section = "", who = "", heading = "";

for (const raw of lines) {
  const line = raw.trim();
  if (line.startsWith("## ")) { section = line.slice(3).toLowerCase(); who = ""; continue; }
  if (line.startsWith("### ")) { heading = line.slice(4); who = heading.replace(/\s*\(.*\)\s*$/, ""); continue; }
  const shown = line.match(/^Name shown:\s*"(.+)"/);
  if (shown && section.startsWith("solo poly")) { out.primaryName = shown[1]; continue; }
  const m = line.match(/^\d+\.\s+(?:\(GT\)\s*)?(.*)$/);
  if (!m) continue;
  const text = m[1];
  if (section.startsWith("named")) (out.named[who] ||= []).push(text);
  else if (section.startsWith("solo poly")) out.primary.push(text);
  else if (section.includes("djs")) {
    const side = heading.includes("left") ? "Left" : "Right";
    out["dj" + side].push(text);
    if (who && who !== "DJ") out["dj" + side + "Name"] = who;   // the heading names the DJ
  }
  else if (section.startsWith("crowd")) out.crowd.push(text);
  else if (section.includes("sock")) out.sock = text;
  else if (section.includes("vortex announcements")) (out.vortex ||= []).push(text);
  else if (section.includes("shout")) out.accost.push(text);
}
fs.writeFileSync(dst, JSON.stringify(out, null, 1));
console.log(Object.keys(out.named).length, "named,", out.primary.length, "primary,", out.djLeft.length + out.djRight.length, "dj,", out.crowd.length, "crowd");
