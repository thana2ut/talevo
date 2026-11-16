/* eslint-disable @typescript-eslint/no-require-imports */
// Browser integration harness. Mocks account/API data in an isolated local server.
// Never writes to a real Talevo account, database, or AI provider.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),assert=require("node:assert/strict"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,".."),modules=process.argv[2],qa=require(path.join(modules,"esbuild")),{chromium}=require(path.join(modules,"playwright"));
const resolver=Module._resolveFilename;Module._resolveFilename=function(request,parent,isMain,options){return resolver.call(this,request.startsWith("@/")?path.join(root,"src",request.slice(2)):request,parent,isMain,options);};
require.extensions[".ts"]=function(module,filename){module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);};
const {buildRescuePlan}=require("../src/lib/rescue.ts");
const now="2026-11-14T08:00:00+07:00";
const task={id:"test-task",title:"รายงานวิชาฐานข้อมูล",description:"ทดสอบเท่านั้น",dueDate:"2026-11-14T23:59:00+07:00",dueLabel:"",estimate:"2 ชม.",status:"todo",color:"#7656F6",subtasks:[]};
const state={tasks:[task],schedules:[],exams:[],now,notifications:[],settings:{},isHydrated:true,isAuthenticated:true};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"talevo-learning-ui-"));
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{ThailandClock}from 'C:/Users/asus/talevo/src/components/thailand-clock';import{RescuePage}from '${root.replaceAll("\\","/")}/src/features/learning/rescue-page';createRoot(document.getElementById('root')).render(<div className="app-shell"><div className="app-workspace"><main className="app-main">{location.pathname==='/clock'?<ThailandClock/>:<RescuePage/>}</main></div></div>);`;
fs.writeFileSync(path.join(directory,"entry.jsx"),entry);
const fakeState=`export const useAppState=()=>({...${JSON.stringify(state)},now:new Date(${JSON.stringify(now)})});`;
const provider=`export const useLanguage=()=>({language:location.search.includes('en')?'en':'th',t:(key)=>key});`;
(async()=>{
 await qa.build({entryPoints:[path.join(directory,"entry.jsx")],outfile:path.join(directory,"bundle.js"),bundle:true,platform:"browser",jsx:"automatic",nodePaths:[path.join(root,"node_modules")],plugins:[{name:"test-fixtures",setup(build){build.onResolve({filter:/^(@\/providers\/(app-state-provider|language-provider)|next\/(link|image))$/},args=>({path:args.path,namespace:"fixture"}));build.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path.includes("app-state")?fakeState:args.path.includes("language-provider")?provider:args.path==="next/link"?`import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`:`import React from 'react';export default function Image({priority,fill,...props}){return React.createElement('img',props)}`,resolveDir:root,loader:"js"}));build.onResolve({filter:/^@\//},args=>({path:["",".ts",".tsx",".css",".json"].map(ext=>path.join(root,"src",args.path.slice(2))+ext).find(file=>fs.existsSync(file))}));}}]});
 const cssFiles=fs.readdirSync(path.join(root,".next/static/css")).filter(f=>f.endsWith(".css"));
 const css=cssFiles.map(f=>fs.readFileSync(path.join(root,".next/static/css",f),"utf8")).join("\n")+fs.readFileSync(path.join(root,"src/styles/dark-mode.css"),"utf8")+fs.readFileSync(path.join(root,"src/styles/desktop-polish.css"),"utf8");
 const server=http.createServer((req,res)=>{
   const file=req.url==="/bundle.js"?path.join(directory,"bundle.js"):req.url==="/bundle.css"?path.join(directory,"bundle.css"):req.url.startsWith("/brand/")||req.url.startsWith("/assets/")?path.join(root,"public",req.url):req.url.startsWith("/_next/static/")?path.join(root,".next/static",req.url.slice(14)):null;
   if(req.url==="/global.css"){res.setHeader("Content-Type","text/css");res.end(css);return;}
   if(file&&fs.existsSync(file)){res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".png")?"image/png":"application/octet-stream");res.end(fs.readFileSync(file));return;}
   res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:"chrome",headless:true});let passed=0;
 try{
  for(const [width,height] of [[390,844],[834,1194],[1366,1024],[1440,1000]].filter(v=>!process.argv[3]||v[0]===Number(process.argv[3])))for(const theme of ["light","dark"]){
   const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/api/learning/rescue",async route=>{const req=route.request(),body=req.method()==="POST"?req.postDataJSON():null;let data;
     data=body?.operation==="plan"?{preferences:body.preferences,plan:buildRescuePlan(state.tasks,[],[],body.preferences,Date.parse(now)+300000)}:body?.operation==="save"?{revision:1}:{revision:0,payload:null};
     await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
   });
   await page.addInitScript(theme=>{document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.theme=theme;});},theme);
   for(const route of ["rescue"]){
     await page.goto(`${origin}/${route}`);await page.getByRole("heading",{name:"โหมดกู้สถานการณ์",exact:true}).waitFor();
       await page.getByRole("button",{name:"แก้ไขเวลาว่าง",exact:true}).click();await page.getByRole("button",{name:"เพิ่มช่วงเวลา",exact:true}).click();
       await page.getByLabel("เริ่ม",{exact:true}).fill("09:00");await page.getByLabel("สิ้นสุด",{exact:true}).fill("17:00");await page.getByRole("button",{name:"เสร็จสิ้น",exact:true}).click();
       await page.getByRole("button",{name:"สร้างแผนกู้สถานการณ์",exact:true}).click();await page.locator(".rescue-timeline li").first().waitFor();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,`${route} horizontal overflow ${width}/${theme}`);
     const boxes=await page.locator(".learning-panel,.learning-stats>.card").evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right}}));assert.ok(boxes.every(b=>b.left>=-1&&b.right<=width+1),`${route} panel outside viewport`);
     await page.screenshot({path:path.join(directory,`${route}-${width}-${theme}.png`),fullPage:true});passed++;console.log(`PASS browser ${route} ${width} ${theme}`);
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  const clockPage=await browser.newPage({viewport:{width:390,height:844},timezoneId:"America/New_York"});
  await clockPage.route("**/api/time",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({now:Date.parse("2026-11-15T00:00:00Z")})}));
  await clockPage.goto(`${origin}/clock`);await clockPage.waitForFunction(()=>/^07:00:0\d$/.test(document.querySelector('time')?.textContent??''));const before=await clockPage.locator('time').innerText();await clockPage.waitForFunction(value=>document.querySelector('time')?.textContent!==value,before);assert.match(await clockPage.locator('time').innerText(),/^07:00:0\d$/);await clockPage.close();console.log("PASS synchronized Thailand clock advances seconds outside Thailand timezone");
  console.log(`${passed} browser scenarios passed. Screenshots: ${directory}`);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
