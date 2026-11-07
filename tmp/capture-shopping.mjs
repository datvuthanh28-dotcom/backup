import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']}); const p=await b.newPage();await p.setViewport({width:1440,height:1000});
const dir='tmp/docs-images';
await p.goto('http://127.0.0.1:5173/product/107',{waitUntil:'networkidle2'});
await p.evaluate(()=>{const buttons=[...document.querySelectorAll('button')]; buttons.find(x=>x.textContent.trim()==='S')?.click();});
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/add to bag/i.test(x.textContent))?.click());
await p.goto('http://127.0.0.1:5173/cart',{waitUntil:'networkidle2'}); await p.screenshot({path:dir+'/bag-filled.png'});
await p.goto('http://127.0.0.1:5173/checkout',{waitUntil:'networkidle2'}); await p.screenshot({path:dir+'/checkout.png'});
await b.close();
