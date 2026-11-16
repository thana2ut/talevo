/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/features/ai/voice-command-sheet.tsx', 'utf8');
const compile = (block, context, result) => new Function(...Object.keys(context), ts.transpileModule(`${block}\nreturn ${result};`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText)(...Object.values(context));
const ref = (current = null) => ({current});
const intentJs = ts.transpileModule(fs.readFileSync('src/lib/ai/voice-intent.ts', 'utf8'), {compilerOptions:{module: ts.ModuleKind.CommonJS}}).outputText;
const mod = {exports:{}};
new Function('exports', intentJs)(mod.exports);
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
    inferVoiceActions: mod.exports.inferVoiceActions, crypto: require('node:crypto').webcrypto,
    setStage: value => stage = value, setError: value => error = value, setPlan: () => {}, setText: () => {},
    setClarification: value => clarification = value,
    fetch: async (url, options) => {
      calls.push({url, body: JSON.parse(options.body)});
      return {ok: url.endsWith('chat') || !failSave, json: async () => url.endsWith('chat') ? {message: JSON.stringify(draft)} : failSave ? {message:'บันทึกไม่สำเร็จ'} : {saved:true}};
    },
  };
  const block = source.slice(source.indexOf('  const persistPlan = async'), source.indexOf('  useEffect(() => { analyzeRef.current'));
  const analyze = command => compile(block, {...ctx, clarification}, 'analyze')(command);
  draft = {action:'create',entity:'task',fields:{title:'รายงาน',course_name:'คณิต',due_date:'2026-11-20T17:00:00+07:00'},summary:'เพิ่มรายงาน'};
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
testExecution().catch(error => { console.error(error); process.exitCode = 1; });
