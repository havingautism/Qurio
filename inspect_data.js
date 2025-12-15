import { createRequire } from 'module'
const require = createRequire(import.meta.url)
try {
  const data = require('./node_modules/fluentui-emoji-js/emojiData.json')
  console.log('Parameters:', Object.keys(data[0]))
  console.log('First Item:', JSON.stringify(data[0], null, 2))
} catch (e) {
  console.error(e)
}
