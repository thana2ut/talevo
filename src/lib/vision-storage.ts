import type { VisionItem } from "@/lib/vision";
import { parseVisionSession } from "@/lib/security/local-data";
export type VisionImage = { id:string; number:number; name:string; blob:Blob; digest:string; state:"queued"|"reading"|"done"|"error"; error?:string; items:VisionItem[] };
export type VisionSession = { schemaVersion:1; owner:string; expires:number; images:VisionImage[]; items:VisionItem[]; savedIds:string[] };
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open("talevo-vision-private",1);request.onupgradeneeded=()=>request.result.createObjectStore("sessions",{keyPath:"owner"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error("เปิดพื้นที่เก็บภาพไม่ได้ กรุณาอนุญาตพื้นที่เก็บข้อมูลในเบราว์เซอร์"));});}
export async function loadVisionSession(owner:string):Promise<VisionSession|null>{
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction("sessions","readwrite");const store=tx.objectStore("sessions");const cursor=store.openCursor();
    cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;if(row.value.expires<Date.now())row.delete();row.continue();};
    const request=store.get(owner);let result:VisionSession|null=null;
    request.onsuccess=()=>{const session=parseVisionSession(request.result, owner);if(session)result=session;};
    tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(new Error("อ่านคิวภาพที่เก็บไว้ไม่สำเร็จ"));};
  });
}
export async function saveVisionSession(session:VisionSession){
  const parsed=parseVisionSession(session, session.owner);
  if(!parsed)throw new Error("ข้อมูลคิวภาพไม่ถูกต้อง จึงยังไม่ได้บันทึก");
  const db=await database();return new Promise<void>((resolve,reject)=>{const tx=db.transaction("sessions","readwrite");tx.objectStore("sessions").put(session);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(new Error("พื้นที่เก็บข้อมูลไม่พอ คิวนี้อาจไม่สามารถกู้คืนหลังปิดหน้าเว็บได้"));};});
}
export async function clearVisionSession(owner:string){const db=await database();return new Promise<void>((resolve,reject)=>{const tx=db.transaction("sessions","readwrite");tx.objectStore("sessions").delete(owner);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(new Error("ลบภาพชั่วคราวไม่สำเร็จ"));};});}
export async function prepareVisionImage(file:File):Promise<Blob>{
  if(!file.size||file.size>20*1024*1024)throw new Error(`${file.name}: รองรับภาพต้นฉบับไม่เกิน 20 MB ต่อภาพ`);
  const header=new Uint8Array(await file.slice(0,32).arrayBuffer());
  const text=new TextDecoder("ascii").decode(header);
  const valid=(header[0]===137&&header[1]===80&&header[2]===78&&header[3]===71)||(header[0]===255&&header[1]===216&&header[2]===255)||(text.startsWith("RIFF")&&text.includes("WEBP"))||(text.slice(4,8)==="ftyp"&&/heic|heix|hevc|mif1|heif/.test(text));
  if(!valid)throw new Error(`${file.name}: รองรับเฉพาะภาพ PNG, JPG, WEBP หรือ HEIC ที่อุปกรณ์อ่านได้`);
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;
    try{await image.decode();}catch{throw new Error(`${file.name}: อุปกรณ์นี้อ่านภาพไม่ได้ หากเป็น HEIC กรุณาแปลงเป็น JPG ก่อน`);}
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40000000)throw new Error(`${file.name}: ความละเอียดภาพสูงเกินไป กรุณาลดขนาดก่อน`);
    const scale=Math.min(1,3072/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    const context=canvas.getContext("2d");if(!context)throw new Error("อุปกรณ์นี้เตรียมภาพไม่สำเร็จ");
    context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.94));
    canvas.width=1;canvas.height=1;
    if(!blob||blob.size>3*1024*1024)throw new Error(`${file.name}: ภาพใหญ่เกินไป กรุณาครอปเฉพาะเนื้อหา Classroom`);
    return blob;
  }finally{URL.revokeObjectURL(url);}
}
