/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS catalogue maintenance utility. */
// Source migration utility. Generates a static catalogue; never translates user records.
const fs = require('fs');
const ts = require('typescript');
const roots = ['src/components', 'src/features'];
const files = [];
function walk(p) { for (const e of fs.readdirSync(p,{withFileTypes:true})) { const f=p+'/'+e.name; if(e.isDirectory())walk(f); else if(f.endsWith('.tsx'))files.push(f); } }
roots.forEach(walk);
files.push('src/providers/auth-provider.tsx','src/providers/app-state-provider.tsx','src/lib/grade-lab.ts','src/lib/vision.ts','src/lib/task-attachment-validation.ts','src/lib/alerts/alert-engine.ts','src/lib/alerts/deadline-risk.ts','src/lib/alerts/weekly-radar.ts','src/lib/task-utils.ts','src/lib/academic-planning.ts','src/lib/academic-utils.ts','src/lib/university-timetable-pages.ts','src/app/api/ai/syllabus/analyze/route.ts');
const thai = /[ก-๙]/;
const entries = new Set();
function template(n) { return n.head.text+n.templateSpans.map((s,i)=>`{${i}}`+s.literal.text).join(''); }
for (const file of files) {
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true,4);
  function visit(n) {
    if ((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n))&&thai.test(n.text)&&n.text.trim().length<1000) entries.add(ts.isJsxText(n)?n.text.replace(/\s+/g,' ').trim():n.text);
    if(ts.isTemplateExpression(n)&&thai.test(template(n)))entries.add(template(n));
    ts.forEachChild(n,visit);
  }
  visit(source);
}
const catalogue='src/lib/ui-translations.en.json';
async function generate() {
  require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
  const Groq=require('groq-sdk');
  if(!process.env.GROQ_API_KEY)throw new Error('Translation provider is not configured');
  const client=new Groq({apiKey:process.env.GROQ_API_KEY,timeout:120000,maxRetries:2});
  const output=fs.existsSync(catalogue)?JSON.parse(fs.readFileSync(catalogue,'utf8')):{};
  const pending=[...entries].filter(x=>x&&!output[x]);
  for(let start=0;start<pending.length;) {
    const batch=[]; let size=0; while(start+batch.length<pending.length && batch.length<12){const next=pending[start+batch.length];if(batch.length&&size+next.length>1000)break;batch.push(next);size+=next.length;}
    start+=batch.length;
    const result=await client.chat.completions.create({model:process.env.TALEVO_AI_MODEL||'openai/gpt-oss-120b',reasoning_effort:'low',temperature:0,response_format:{type:'json_object'},max_completion_tokens:4000,messages:[{role:'system',content:'Translate Thai UI strings for Talevo university planner into concise natural English. Return JSON object mapping each EXACT Thai input key to English. Preserve ALL {0}, {1} placeholders exactly, markup, newlines and numbers. No Thai letters in English values. Do not invent content. Use class for คาบ, course for วิชา, task for งาน. Retain product names. Grade thresholds must remain unchanged. This is a static software translation catalogue, not user records.'},{role:'user',content:JSON.stringify(batch)}]});
    const parsed=JSON.parse(result.choices[0].message.content);
    for(const key of batch){if(typeof parsed[key]!=='string'||!parsed[key].trim()||thai.test(parsed[key])){console.log('Retry later: '+key.slice(0,70));continue;}output[key]=parsed[key];}
    fs.writeFileSync(catalogue,JSON.stringify(output,null,2)+'\n');
    console.log('Translated '+start+'/'+pending.length);
  }
}
if(process.argv.includes('--generate'))generate().catch((error)=>{console.error('Static translation generation failed:', error.status || error.message || 'Unknown');process.exitCode=1;});
module.exports={files,template};
