import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const dir='/Users/htmt1810/Documents/GitHub/backup/tmp/docs-images';
for(const [role,email,password,paths] of [
 ['customer','vudat9532@gmail.com','customer123',[['profile','/account/profile'],['orders','/account/orders'],['offers','/account/offers']]],
 ['staff','staffmaisonrue@gmail.com','staff123',[['staff-dashboard','/staff'],['inventory','/staff/inventory'],['staff-orders','/staff/orders'],['staff-returns','/staff/returns']]],
 ['admin','vanhung29993@gmail.com','admin123',[['admin-dashboard','/admin'],['employees','/admin/employees'],['reports','/admin/reports'],['insights','/admin/product-insights'],['promotions','/admin/promotions'],['admin-returns','/admin/returns']]]]) {
 const context=await browser.createBrowserContext(); const p=await context.newPage(); await p.setViewport({width:1440,height:1000});
 await p.goto('http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded'});
 const ok=await p.evaluate(async ({role,email,password})=>{const r=await fetch('/api/auth/'+role+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});return r.ok;},{role,email,password});
 console.log(role,ok); if(ok) for(const [name,path] of paths){await p.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle2',timeout:30000}); await p.screenshot({path:`${dir}/${name}.png`}); console.log(name);} await context.close();
}
await browser.close();
