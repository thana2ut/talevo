/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/features/ai/voice-command-sheet.tsx', 'utf8');
const compile = (block, context, result) => new Function(...Object.keys(context), ts.transpileModule(`${block}\nreturn ${result};`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText)(...Object.values(context));
const ref = (current = null) => ({current});
const payloadModule = {exports:{}};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync('src/lib/security/payload.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require, payloadModule.exports);
const {apiPayloadSchemas} = payloadModule.exports;
const intentJs = ts.transpileModule(fs.readFileSync('src/lib/ai/voice-intent.ts', 'utf8'), {compilerOptions:{module: ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
new Function('exports', intentJs)(mod.exports);
const groqSource = fs.readFileSync('src/lib/ai/providers/groq.ts','utf8');
const formatMessages = compile(groqSource.slice(groqSource.indexOf('function formatChatMessages'),groqSource.indexOf('function createClient')), {
  TALEVO_AI_SYSTEM_INSTRUCTION:'test system', AI_MESSAGE_MAX_LENGTH:8000,
  buildTemporalContextBlock:()=>'',getAuthoritativeTemporalContext:()=>({}),
}, 'formatChatMessages');
const longPrompt = 'ข้อกำหนดคำสั่ง '.repeat(350) + 'คำสั่งผู้ใช้และตารางเรียนจริงที่ท้ายข้อความ';
assert.ok(longPrompt.length > 4000 && longPrompt.length < 8000);
const sentMessages = formatMessages({message:longPrompt,contextBlock:'[CURRENT_TIME_CONTEXT]',history:[]});
assert.equal(sentMessages.at(-1).content.length,longPrompt.length,'Provider truncated the command and inventory before reaching the model');
assert.ok(sentMessages.at(-1).content.endsWith('คำสั่งผู้ใช้และตารางเรียนจริงที่ท้ายข้อความ'));
assert.equal(formatMessages({message:'x'.repeat(8100),contextBlock:'[CURRENT_TIME_CONTEXT]',history:[]}).at(-1).content.length,8000);
console.log('PASS: Groq keeps the full allowed voice prompt and trailing course inventory while enforcing the API message limit');
const instances = [], timers = new Map(), commands = [];
let timerId = 0, stage = '', text = '', error = '';
class Mic {
  constructor() { instances.push(this); }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
}
const context = {
  window: {SpeechRecognition: Mic}, recognition: ref(), held: ref(false), busy: ref(false),
  stopping: ref(false), listeningStarted: ref(false), startTimer: ref(), finishTimer: ref(), silenceTimer: ref(),
  mounted: ref(true), analyzeRef: ref(async command => commands.push(command)),
  setStage: value => stage = value, setError: value => error = value, setPlan: () => {}, setText: value => text = value,
  uiText: {locale: 'th-TH'}, setTimeout: (fn, delay) => { timers.set(++timerId, {fn, delay}); return timerId; },
  clearTimeout: id => timers.delete(id),
};
const api = compile(source.slice(source.indexOf('  const stop = () =>'), source.indexOf('  const persistPlan = async')), context, '{start,stop}');
const result = (mic, transcript, isFinal = true) => mic.onresult({results:[{0:{transcript},isFinal}]});
const fire = delay => { const entry = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(entry, `Missing timer ${delay}`); timers.delete(entry[0]); entry[1].fn(); };
for (let i = 0; i < 20; i++) {
  api.start(); assert.equal(stage, 'listening');
  const mic = instances.at(-1);
  result(mic, 'คำสั่งเก่า', false); result(mic, `เพิ่มงาน ${i}`);
  assert.equal(text, `เพิ่มงาน ${i}`);
  if (i % 2) fire(2000); else api.stop();
  assert.equal(context.recognition.current, null);
  assert.equal(commands.at(-1), `เพิ่มงาน ${i}`);
  mic.onend?.(); assert.equal(commands.length, i + 1);
  assert.equal(timers.size, 0);
}
for (const failure of ['network', 'not-allowed', 'aborted', 'no-speech']) {
  api.start(); const old = instances.at(-1); result(old, 'ข้อความที่ยังไม่ครบ');
  old.onerror({error:failure}); assert.equal(stage, 'ready'); assert.equal(context.recognition.current, null);
  assert.equal(commands.length, 20); assert.equal(timers.size, 0);
  api.start(); old.onend?.(); assert.equal(stage, 'listening'); api.stop();
}
api.start(); instances.at(-1).stop = () => {}; result(instances.at(-1), 'เพิ่มงานค้าง'); api.stop(); fire(10000);
assert.equal(context.recognition.current, null); assert.equal(commands.length, 20); assert.ok(error);
api.start(); api.stop(); assert.equal(timers.size, 0);
context.busy.current = true; api.start(); assert.equal(context.recognition.current, null); context.busy.current = false;
context.mounted.current = false; api.start(); assert.equal(context.recognition.current, null);
console.log('PASS: 20 repeated microphone sessions, silence submission, interim replacement, duplicate/stale events, four error recoveries, timeout cleanup, busy/unmount guards');
for (const [input, expected] of [
  ['เพิ่มงานสรุปบทที่สาม', ['create']], ['เลื่อนส่งงานเป็นพรุ่งนี้', ['update']], ['ลบงานรายงาน', ['delete']],
  ['Add homework', ['create']], ['Reschedule exam', ['update']], ['วันนี้มีงานอะไรบ้าง', []],
  ['เพิ่มงานแล้วลบงานเก่า', ['create','delete']], ['ตั้งสอบวิชาคณิตพรุ่งนี้เก้าโมง', ['create']],
  ['ปรับเวลาส่งรายงานเป็นห้าโมงเย็น', ['update']],
]) assert.deepEqual(mod.exports.inferVoiceActions(input), expected);
console.log('PASS: 9 Thai/English intent cases');

async function testExecution() {
  let clarification = null, draft = {}, calls = [], failSave = false;
  const completedPlans = ref([]), busy = ref(false);
  const ctx = {
    text: '', clarification, busy, recognition: ref(), controller: ref(), mounted: ref(true), completedPlans,
    tasks: [], schedules: [], exams: [], academicTerm: {level:'',term:'',academicYear:''},
    inferVoiceActions: mod.exports.inferVoiceActions, getTaskVoiceHints: mod.exports.getTaskVoiceHints, crypto: require('node:crypto').webcrypto,
    setStage: value => stage = value, setError: value => error = value, setPlan: () => {}, setText: () => {},
    setClarification: value => clarification = value,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({url, body});
      const boundary = (url.endsWith('chat') ? apiPayloadSchemas.chat : apiPayloadSchemas.voice).safeParse(body);
      if (!boundary.success) return {ok:false,status:400,json:async()=>({code:'SECURITY_400',message:'คำขอไม่ถูกต้อง กรุณาตรวจข้อมูลแล้วลองใหม่'})};
      return {ok: url.endsWith('chat') || !failSave, json: async () => url.endsWith('chat') ? {message: JSON.stringify(draft)} : failSave ? {message:'บันทึกไม่สำเร็จ'} : {saved:true}};
    },
  };
  const block = source.slice(source.indexOf('  const persistPlan = async'), source.indexOf('  useEffect(() => { analyzeRef.current'));
  const analyze = command => compile(block, {...ctx, clarification}, 'analyze')(command);
  draft = {action:'create',entity:'task',fields:{title:'รายงาน',course_name:'คณิต',due_date:'2026-11-20T17:00:00+07:00'},summary:'เพิ่มรายงาน',question:''};
  await analyze('เพิ่มงานรายงานวิชาคณิต'); assert.equal(stage,'done'); assert.equal(calls.length,2);
  assert.equal(completedPlans.current.length,1); const id = completedPlans.current[0].id;
  draft = {action:'update',entity:'task',id,fields:{due_date:'2026-11-21T17:00:00+07:00'},summary:'เลื่อนรายงาน'};
  await analyze('เลื่อนส่งรายงานเป็นวันเสาร์'); assert.equal(stage,'done'); assert.equal(completedPlans.current.length,2);
  assert.ok(calls[2].body.message.includes(id));
  draft = {action:'create',entity:'task',question:'ส่งวันไหนครับ?'};
  await analyze('เพิ่มงานอีกชิ้น'); assert.equal(stage,'ready'); assert.ok(clarification); assert.equal(calls.length,5);
  draft = {action:'create',entity:'task',fields:{title:'อีกชิ้น'},summary:'เพิ่มอีกชิ้น'};
  await analyze('พรุ่งนี้ห้าโมงเย็น'); assert.equal(stage,'done'); assert.ok(calls[5].body.message.includes('เพิ่มงานอีกชิ้น'));
  const count = calls.length; draft = {action:'delete',entity:'task',id,fields:{},summary:'ลบ'};
  await analyze('เพิ่มงาน'); assert.equal(calls.length,count + 1); assert.equal(stage,'ready');
  failSave = true; draft = {action:'create',entity:'task',fields:{title:'บันทึกพลาด'},summary:'เพิ่ม'};
  await analyze('เพิ่มงาน'); assert.equal(stage,'ready'); assert.equal(error,'บันทึกไม่สำเร็จ'); assert.equal(busy.current,false);
  draft = null; await analyze('เพิ่มงาน'); assert.equal(stage,'ready'); assert.ok(error.includes('รูปแบบ'));
  draft = {question: {bad: true}}; await analyze('เพิ่มงาน'); assert.equal(stage,'ready'); assert.ok(error.includes('รูปแบบ'));
  const previous = calls.length; await analyze('วันนี้มีงานอะไรบ้าง'); assert.equal(calls.length,previous);
  console.log('PASS: automatic execution, successive create/update with fresh inventory, spoken clarification, action mismatch rejection, failed save recovery, question guard');
}
const screenshotCommand = 'เพิ่มงานให้หน่อย ในรายวิชาของวันจันทร์ตอนบ่าย ชื่องานว่าการบ้านส่งวันพุธเวลา 17:00 น.';
const slots = [
  {id:'slot-morning',course_id:'course-morning',name:'วิชาเช้า',day:0,start_time:'09:00'},
  {id:'slot-afternoon',course_id:'course-afternoon',name:'วิชานวัตกรรม',day:0,start_time:'13:00'},
  {id:'slot-wednesday',course_id:'course-wednesday',name:'วิชาวันส่งงาน',day:2,start_time:'13:00'},
];
const {getTaskVoiceHints} = mod.exports;
assert.deepEqual(getTaskVoiceHints(screenshotCommand, slots), {title:'การบ้าน',course:{course_name:'วิชานวัตกรรม',course_id:'course-afternoon'}});
assert.equal(getTaskVoiceHints('เพิ่มงานชื่อรายงาน ส่งวันพุธเวลา 17:00', slots).course, undefined);
assert.equal(getTaskVoiceHints(screenshotCommand, [...slots,{...slots[1],id:'same-course'}]).course.course_id, 'course-afternoon');
assert.ok(getTaskVoiceHints(screenshotCommand, [...slots,{...slots[1],id:'different',course_id:'different',name:'อีกวิชา'}]).question.includes('หลายวิชา'));
assert.ok(getTaskVoiceHints(screenshotCommand, []).question.includes('ไม่พบคาบ'));
assert.equal(getTaskVoiceHints('เพิ่มงานในคาบวันจันทร์ ชื่องานว่ารายงาน ส่งพรุ่งนี้', slots).course, undefined);
assert.equal(getTaskVoiceHints('เพิ่มงานชื่อรายงาน วิชาคณิต ส่ง วันพุธ', slots).title,'รายงาน');
assert.equal(getTaskVoiceHints('เพิ่มงานชื่องานว่า “รายงานการส่งวันพุธ” ส่งพรุ่งนี้', slots).title,'รายงานการส่งวันพุธ');
assert.equal(getTaskVoiceHints('เพิ่มงานในคาบวันจันทร์บ่าย งานชื่อการบ้าน ส่งวันพุธ', slots).course.course_id,'course-afternoon');
console.log('PASS: screenshot task title, class weekday versus deadline, period matching, same-course deduplication, ambiguous/missing course questions');

async function testScreenshotCommand(live = false, command = screenshotCommand) {
  let clarification = null, state = '', saved = [], modelCalls = 0, lastPrompt = '', nextSaveError = null, draftQuestion = null;
  const ctx = {
    text:'', busy:ref(false), recognition:ref(), controller:ref(), mounted:ref(true), completedPlans:ref([]),
    tasks:[], exams:[], schedules:slots.map(slot=>({...slot,courseId:slot.course_id,startTime:slot.start_time,endTime:'16:00'})),
    academicTerm:{level:'',term:'',academicYear:''}, inferVoiceActions:mod.exports.inferVoiceActions, getTaskVoiceHints,
    crypto:require('node:crypto').webcrypto, setStage:value=>state=value, setError:value=>error=value, setPlan:()=>{},setText:()=>{},setClarification:value=>clarification=value,
    fetch:async (url, options) => {
      const body = JSON.parse(options.body);
      const schema = url.endsWith('chat') ? apiPayloadSchemas.chat : apiPayloadSchemas.voice;
      assert.ok(schema.safeParse(body).success, 'Real API boundary rejected the request');
      if (url.endsWith('chat')) {
        lastPrompt = body.message; modelCalls++;
        const message = live ? (await generateLiveResponse(body.message)).text : JSON.stringify({action:'create',entity:'task',fields:{title:'การบ้านส่งวันพุธ',course_name:'วิชานวัตกรรม',course_id:'course-afternoon',due_date:'2026-11-18T17:00:00+07:00'},summary:'เพิ่มการบ้าน',question:draftQuestion,confidence:0.99});
        return {ok:true,json:async()=>({message})};
      }
      if (nextSaveError) return {ok:false,status:400,json:async()=>({message:nextSaveError})};
      saved.push(body);
      return {ok:true,status:200,json:async()=>({saved:true})};
    },
  };
  const block = source.slice(source.indexOf('  const persistPlan = async'), source.indexOf('  useEffect(() => { analyzeRef.current'));
  const analyze = command => compile(block, {...ctx,clarification}, 'analyze')(command);
  await analyze(command);
  if (live && state !== 'done') console.log(JSON.stringify({state,question:clarification?.question,uiError:error}));
  assert.equal(state,'done', error);
  assert.equal(saved[0].fields.title,'การบ้าน');
  assert.equal(saved[0].fields.course_id,'course-afternoon');
  assert.equal(saved[0].fields.course_name,'วิชานวัตกรรม');
  assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',weekday:'long'}).format(new Date(saved[0].fields.due_date)),'Wednesday');
  assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(saved[0].fields.due_date)),'17:00');
  assert.deepEqual(Object.keys(saved[0]).sort(),['action','entity','fields','id','summary']);
  assert.ok(lastPrompt.includes('course-afternoon'));
  if (live) { console.log('PASS LIVE: screenshot transcript → configured AI → Wednesday 17:00 deadline → correct Monday-afternoon course → real API schema; no database writes'); return; }
  for (const question of ['',null,'   ']) {
    draftQuestion = question; await analyze(screenshotCommand); assert.equal(state,'done');
  }
  ctx.schedules.push({...ctx.schedules[1],id:'different',courseId:'different',name:'อีกวิชา'});
  const before = modelCalls; await analyze(screenshotCommand);
  assert.equal(state,'ready'); assert.ok(clarification.question.includes('หลายวิชา')); assert.equal(modelCalls,before);
  await analyze('วิชานวัตกรรม'); assert.equal(state,'done'); assert.ok(lastPrompt.includes('คำตอบเพิ่มเติมของผู้ใช้: วิชานวัตกรรม'));
  ctx.schedules.pop(); nextSaveError = 'กรุณาระบุกำหนดส่งงาน';
  await analyze(screenshotCommand); assert.equal(state,'ready'); assert.equal(clarification.question,nextSaveError);
  assert.ok(clarification.command.includes('ชื่องานว่าการบ้าน'));
  nextSaveError = null; await analyze('วันพุธเวลา 17:00'); assert.equal(state,'done');
  assert.ok(lastPrompt.includes('ชื่องานว่าการบ้าน')); assert.equal(clarification,null);
  console.log('PASS: screenshot flow through real chat/voice schemas, null/empty/whitespace question, metadata filtering, spoken course selection, server validation follow-up');
}

let generateLiveResponse;
async function main() {
  await testExecution();
  await testScreenshotCommand();
  if (process.argv.includes('--live')) {
    // Use configured credentials internally. Never print environment values or raw provider errors.
    const Module = require('node:module'), path = require('node:path');
    const root = path.resolve(__dirname,'..');
    require('@next/env').loadEnvConfig(root, false, {info:()=>{},error:()=>{}});
    const originalResolve = Module._resolveFilename, originalLoad = Module._load;
    Module._resolveFilename = function(request,parent,isMain,options) { return originalResolve.call(this,request.startsWith('@/') ? path.join(root,'src',request.slice(2)) : request,parent,isMain,options); };
    Module._load = function(request,parent,isMain) { return request === 'server-only' ? {} : originalLoad.call(this,request,parent,isMain); };
    const previousTs = require.extensions['.ts'];
    require.extensions['.ts'] = (module,filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
    try {
      const gateway = require('../src/lib/ai/gateway.ts');
      assert.ok(gateway.isOnlineAIConfigured(), 'Live AI is not configured locally');
      generateLiveResponse = message => gateway.generateAIResponse({message,history:[],contextBlock:'',signal:AbortSignal.timeout(30000)});
      await testScreenshotCommand(true);
      await testScreenshotCommand(true, 'เพิ่มงานให้หน่อย ในคาบวันจันทร์บ่าย งานชื่อการบ้าน ส่งวันพุธห้าโมงเย็น');
    } finally { Module._resolveFilename=originalResolve;Module._load=originalLoad;require.extensions['.ts']=previousTs; }
  }
}
main().catch(error => { console.error(process.argv.includes('--live') ? 'Voice QA failed: ' + (error instanceof assert.AssertionError ? error.message : 'Live provider request did not complete; no secrets logged') : error); process.exitCode = 1; });
