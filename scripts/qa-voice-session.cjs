/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/features/ai/voice-command-sheet.tsx','utf8');
const block=source.slice(source.indexOf('  const stop = () =>'),source.indexOf('  const analyze = async'));
const js=ts.transpileModule(block+'\nreturn {start,stop};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let instances=[],text='',stage='',error='',timers=new Map(),tid=0;
class Mic { constructor(){instances.push(this)} start(){this.onstart?.()} stop(){this.onend?.()} abort(){this.onend?.()} }
const ref=()=>({current:null});
const refs=[ref(),{current:false},{current:false},{current:false},{current:false},ref(),ref()];
const run=new Function('window','recognition','held','busy','stopping','listeningStarted','startTimer','finishTimer','setStage','setError','setPlan','setText','uiText','setTimeout','clearTimeout',js);
const api=run({SpeechRecognition:Mic},...refs,v=>stage=v,v=>error=v,()=>{},v=>text=v,{locale:'th-TH'},fn=>{timers.set(++tid,fn);return tid},id=>timers.delete(id));
for(let i=0;i<10;i++){api.start();assert.equal(stage,'listening');const mic=instances.at(-1);mic.onresult({results:[{0:{transcript:'คำสั่ง '+i},isFinal:true}]});assert.equal(text,'คำสั่ง '+i);api.stop();assert.equal(stage,'ready');assert.equal(refs[0].current,null)}
api.start();const old=instances.at(-1);old.onerror({error:'network'});assert.ok(error.includes('เชื่อมต่อ'));assert.equal(stage,'ready');assert.equal(refs[0].current,null);api.start();old.onend?.();assert.equal(stage,'listening');assert.equal(refs[0].current,instances.at(-1));api.stop();
api.start();instances.at(-1).onend();assert.equal(stage,'ready');assert.equal(refs[0].current,null);
console.log('PASS: 10 successive sessions, error recovery, stale events, natural end');
const intentJs=ts.transpileModule(fs.readFileSync('src/lib/ai/voice-intent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const mod={exports:{}};new Function('exports',intentJs)(mod.exports);
for(const [input,expected] of [['เพิ่มงานสรุปบทที่สาม',['create']],['เลื่อนส่งงานเป็นพรุ่งนี้',['update']],['ลบงานรายงาน',['delete']],['Add homework',['create']],['Reschedule exam',['update']],['วันนี้มีงานอะไรบ้าง',[]],['เพิ่มงานแล้วลบงานเก่า',['create','delete']]])assert.deepEqual(mod.exports.inferVoiceActions(input),expected);
console.log('PASS: 7 Thai/English intent and non-mutation cases');
