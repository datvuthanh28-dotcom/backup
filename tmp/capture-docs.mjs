import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const dir = '/Users/htmt1810/Documents/GitHub/backup/tmp/docs-images';
fs.mkdirSync(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage(); await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
for(const [name,path] of [['home','/'],['catalog','/men'],['product','/product/107'],['login','/login'],['wishlist','/wishlist'],['cart','/cart'],['story','/our-story'],['returns-policy','/returns'],['staff-login','/staff/login'],['admin-login','/admin/login']]){
 await page.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle2',timeout:30000}); await page.screenshot({path:`${dir}/${name}.png`}); console.log(name);
}
await browser.close();
