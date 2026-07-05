import { randomUUID } from "node:crypto"
import { AppConfig } from "#src/config.ts"

console.log("hello world", AppConfig.appName, randomUUID())
