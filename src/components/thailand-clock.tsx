"use client";
import {useEffect,useState} from "react";
import {Clock3} from "lucide-react";
import {useUiText} from "@/providers/ui-language";
import "./thailand-clock.css";
const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",numberingSystem:"latn"});
export function ThailandClock({className=""}:{className?:string}){
  const t=useUiText();const [value,setValue]=useState("--:--:--");
  useEffect(()=>{
    let anchor={epoch:Date.now(),tick:performance.now()},timer:ReturnType<typeof setTimeout>|undefined,active=true,syncing=false;
    const abort=new AbortController();
    const render=()=>{if(!active)return;const now=anchor.epoch+performance.now()-anchor.tick;setValue(formatter.format(now));timer=setTimeout(render,Math.max(20,1000-now%1000));};
    const synchronize=async()=>{if(syncing||!active)return;syncing=true;try{const start=performance.now(),response=await fetch("/api/time",{cache:"no-store",signal:abort.signal});const data=await response.json(),end=performance.now();if(response.ok&&Number.isFinite(data.now)&&active)anchor={epoch:data.now+(end-start)/2,tick:end};}catch{/* Offline: continue ticking using the latest synchronized anchor. */}finally{syncing=false;}};
    const focus=()=>{if(document.visibilityState==="visible")void synchronize();};
    render();void synchronize();const resync=setInterval(()=>void synchronize(),60000);document.addEventListener("visibilitychange",focus);window.addEventListener("focus",focus);
    return()=>{active=false;abort.abort();clearTimeout(timer);clearInterval(resync);document.removeEventListener("visibilitychange",focus);window.removeEventListener("focus",focus);};
  },[]);
  return <span className={`thailand-clock ${className}`} aria-label={t("เวลาปัจจุบันประเทศไทย")}><Clock3 aria-hidden="true"/><time>{value}</time></span>;
}
