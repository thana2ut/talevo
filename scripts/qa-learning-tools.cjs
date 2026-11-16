/* eslint-disable @typescript-eslint/no-require-imports */
// Fixtures for tests only; never loaded by the application.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript"),Module=require("node:module");
const root=path.resolve(__dirname,".."),original=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){return original.call(this,request.startsWith("@/")?path.join(root,"src",request.slice(2)):request,parent,isMain,options);};
require.extensions[".ts"]=function(module,filename){module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);};
const r=require("../src/lib/rescue.ts");let count=0;
function check(name,run){run();count++;console.log("PASS "+name);}
const now=Date.parse("2026-11-14T08:00:00+07:00");
const task=(id,due="2026-11-14T18:00:00+07:00",estimate="2 ชม.")=>({id,title:id,description:"",dueDate:due,dueLabel:"",estimate,status:"todo",color:"#7656F6",subtasks:[]});
const preferences={windows:[{date:"2026-11-14",start:"09:00",end:"17:00"}],importance:{},minutes:{}};
check("Thai and English estimates",()=>{assert.equal(r.estimateMinutes("1.5 ชั่วโมง"),90);assert.equal(r.estimateMinutes("2 hours 15 minutes"),135);assert.equal(r.estimateMinutes("unknown"),null);});
check("Bangkok date is independent of host timezone",()=>assert.equal(r.localDate(new Date("2026-11-13T18:00:00Z")),"2026-11-14"));
check("Time windows cannot overlap or contain impossible dates",()=>{assert.throws(()=>r.validateWindows([...preferences.windows,...preferences.windows],now),/ซ้อน/);assert.throws(()=>r.validateWindows([{date:"2026-11-31",start:"10:00",end:"11:00"}],now),/ตรวจวัน/);});
check("Class and exam intervals are excluded",()=>{const plan=r.buildRescuePlan([task("a")],[{id:"c",day:5,startTime:"09:00",endTime:"11:00"}],[{id:"e",startAt:"2026-11-14T11:00:00+07:00",endAt:"2026-11-14T12:00:00+07:00"}],preferences,now);assert.ok(plan.slots.every(slot=>Date.parse(slot.start)>=Date.parse("2026-11-14T12:00:00+07:00")));});
check("Insufficient time is explicitly reported",()=>{const plan=r.buildRescuePlan([task("a","2026-11-14T09:30:00+07:00")],[],[],preferences,now);assert.ok(plan.unplanned[0].minutes>0);assert.ok(plan.warnings.some(w=>w.includes("ไม่พอ")));});
check("No slot extends beyond a future deadline",()=>{const plan=r.buildRescuePlan([task("a","2026-11-14T10:10:00+07:00")],[],[],preferences,now);assert.ok(plan.slots.every(slot=>Date.parse(slot.end)<=Date.parse("2026-11-14T10:10:00+07:00")));});
check("Completed tasks are excluded and progress reduces remaining work",()=>{const tasks=[{...task("done"),status:"completed"},{...task("half"),subtasks:[{id:"one",title:"one",completed:true},{id:"two",title:"two",completed:false}]}];const ranks=r.rankRescueTasks(tasks,preferences,now);assert.equal(ranks.length,1);assert.equal(ranks[0].remaining,60);});
check("Priority reasoning and no silent mutation",()=>{const tasks=[task("later","2026-11-18T18:00:00+07:00"),task("urgent")],copy=JSON.stringify(tasks);const ranks=r.rankRescueTasks(tasks,preferences,now);assert.equal(ranks[0].task.id,"urgent");assert.ok(ranks[0].reasons.length);r.buildRescuePlan(tasks,[],[],preferences,now);assert.equal(JSON.stringify(tasks),copy);});
check("Unknown duration and missing exam end are labelled estimates",()=>{const plan=r.buildRescuePlan([task("a",undefined,"unknown")],[],[{id:"e",startAt:"2026-11-14T10:00:00+07:00"}],preferences,now);assert.ok(plan.warnings.some(w=>w.includes("ประมาณการ")));assert.ok(plan.warnings.some(w=>w.includes("2 ชั่วโมง")));});
check("Slots do not overlap and include breaks",()=>{const plan=r.buildRescuePlan([task("a"),task("b")],[],[],preferences,now);for(let i=1;i<plan.slots.length;i++)assert.ok(Date.parse(plan.slots[i].start)-Date.parse(plan.slots[i-1].end)>=600000);});
console.log(`${count} learning tool tests passed`);
