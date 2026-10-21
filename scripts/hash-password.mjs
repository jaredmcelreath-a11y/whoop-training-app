import bcrypt from "bcryptjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

async function readPassword() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stderr.write("Password: ");
  const rl = createInterface({ input: process.stdin, terminal: false });
  // Mute echo by putting the TTY in raw mode and reading keystrokes.
  process.stdin.setRawMode(true);
  rl.close();
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function onData(ch) {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stderr.write("\n");
          return resolve(buf);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f") buf = buf.slice(0, -1);
        else buf += c;
      }
    });
  });
}

const password = await readPassword();
if (!password) {
  console.error("Empty password");
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);

if (process.argv.includes("--write-env")) {
  // Next.js expands $vars in .env, so each $ in the hash must be escaped.
  const line = `APP_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}`;
  const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const next = /^APP_PASSWORD_HASH=.*$/m.test(env)
    ? env.replace(/^APP_PASSWORD_HASH=.*$/m, () => line)
    : `${env}${env && !env.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(".env", next, { mode: 0o600 });
  console.error("Saved APP_PASSWORD_HASH to .env");
} else {
  console.error("Note: in .env, escape each $ as \\$ (Next.js expands $vars), or use Vercel env UI as-is.");
  console.log(hash);
}
