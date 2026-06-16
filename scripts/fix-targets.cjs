const fs = require('fs')
const path = require('path')

const confPath = path.join('d:\\本地化AI\\DeepSeek_Home\\worldsmith-build\\src-tauri', 'tauri.conf.json')
let conf = fs.readFileSync(confPath, 'utf8')

// Change targets from "all" to ["nsis"] to avoid WiX download timeout
conf = conf.replace('"targets": "all"', '"targets": ["nsis"]')

fs.writeFileSync(confPath, conf, 'utf8')
console.log('Changed build targets to NSIS only')
