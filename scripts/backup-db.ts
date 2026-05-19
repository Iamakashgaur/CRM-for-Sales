import fs from "fs"
import path from "path"

const DB = path.join("prisma", "crm.db")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dest = path.join("backups", `crm-${stamp}.db`)

fs.mkdirSync("backups", { recursive: true })
fs.copyFileSync(DB, dest)
console.log("Backup created:", dest)
