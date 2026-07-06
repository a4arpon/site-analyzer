import { AppConfig } from "#src/config.ts"
import { log } from "node:console"
import { appUpdater } from "#src/updater.ts"

log("hello world", AppConfig.appName, appUpdater())
