/* eslint-disable @typescript-eslint/no-require-imports */
// Opt-in live provider smoke test. Reads existing credentials without printing
// them; accepts an explicitly supplied image path. Does not write any database.
const fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,"..");require("@next/env").loadEnvConfig(root,false,{info:()=>{},error:()=>{}});
const resolve=Module._resolveFilename,load=Module._load;
Module._resolveFilename=function(request,parent,isMain,options){return resolve.call(this,request.startsWith("@/")?path.join(root,"src",request.slice(2)):request,parent,isMain,options);};
Module._load=function(request,parent,isMain){return request==="server-only"?{}:load.call(this,request,parent,isMain);};
require.extensions[".ts"]=function(module,filename){module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);};
(async()=>{
 if(!process.argv[2])throw new Error("Pass an image path explicitly to send it to the configured AI provider.");
 const {analyzeClassroomImage}=require("../src/lib/vision-provider.ts");const {normalizeExtraction}=require("../src/lib/vision.ts");
 const result=await analyzeClassroomImage(fs.readFileSync(process.argv[2]),"image/jpeg",AbortSignal.timeout(45000));
 const items=normalizeExtraction(result,"provider-smoke",1);
 console.log(JSON.stringify({liveProviderSuccess:true,readableText:Boolean(result.rawText),items:items.length,withEvidence:items.filter(i=>i.facts.title.evidence.length).length,unknownYearKept:items.filter(i=>i.issues.includes("โปรดตรวจสอบปีกำหนดส่ง")).length}));
})().catch(error=>{console.error(JSON.stringify({liveProviderSuccess:false,httpStatus:typeof error.status==="number"?error.status:null,reason:"Provider smoke failed; no credentials or provider payload are printed."}));process.exitCode=1;});
