const puppeteer = require('puppeteer')
const path = require('path')
const DIR = path.join(__dirname, 'screenshots')
const URL = 'http://localhost:4006/guide'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function capture() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })

  const forceVisible = () => page.evaluate(() => {
    document.querySelectorAll('[style]').forEach(el => {
      if (el.style.opacity === '0') { el.style.opacity = '1'; el.style.transform = 'translateY(0)' }
    })
  })

  await forceVisible()
  await sleep(500)

  const sections = [
    { name: '01-hero', y: 0 },
    { name: '02-quickstart', y: 700 },
    { name: '03-workflow', y: 1800 },
    { name: '04-ai-chat', y: 2800 },
    { name: '05-board-principles', y: 3800 },
    { name: '06-demo-faq', y: 4800 },
    { name: '07-cta', y: 5800 },
  ]

  for (const s of sections) {
    await page.evaluate(y => window.scrollTo(0, y), s.y)
    await forceVisible()
    await sleep(300)
    await page.screenshot({ path: path.join(DIR, `${s.name}.png`), type: 'png' })
    console.log(`Captured: ${s.name}.png`)
  }

  // 전체 페이지
  await page.evaluate(() => window.scrollTo(0, 0))
  await forceVisible()
  await sleep(300)
  await page.screenshot({ path: path.join(DIR, 'full-page.png'), type: 'png', fullPage: true })
  console.log('Captured: full-page.png')

  await browser.close()
  console.log('Done!')
}
capture().catch(e => { console.error(e); process.exit(1) })
