/** Prepare readable page images for the timetable Vision endpoint. No OCR heuristics. */
export async function prepareUniversityTimetablePages(files: File[], signal: AbortSignal, progress: (page:number)=>void) {
  const output: Blob[]=[];
  const check=()=>{if(signal.aborted)throw new DOMException("Cancelled","AbortError");if(output.length>=12)throw new Error("เลือกเอกสารได้รวมไม่เกิน 12 หน้า");};
  const encode=async(canvas:HTMLCanvasElement)=>{
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.88));
    if(!blob)throw new Error("เตรียมภาพตารางไม่สำเร็จ");
    output.push(blob);progress(output.length);
  };
  for(const file of files){
    check();
    if(file.type==="application/pdf"){
      const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:false});
      try{
        const document=await loading.promise;
        if(document.numPages+output.length>12)throw new Error("เลือกเอกสารได้รวมไม่เกิน 12 หน้า");
        for(let n=1;n<=document.numPages;n++){
          check();const page=await document.getPage(n);const original=page.getViewport({scale:1});
          const viewport=page.getViewport({scale:Math.min(2,1800/Math.max(original.width,original.height))});
          const canvas=window.document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const context=canvas.getContext("2d");if(!context)throw new Error("อุปกรณ์นี้เตรียมภาพ PDF ไม่สำเร็จ");
          const render=page.render({canvas,canvasContext:context,viewport});
          const cancel=()=>render.cancel();signal.addEventListener("abort",cancel,{once:true});
          try{await render.promise;await encode(canvas);}finally{signal.removeEventListener("abort",cancel);canvas.width=1;canvas.height=1;page.cleanup();}
        }
      }finally{await loading.destroy();}
    }else{
      const url=URL.createObjectURL(file);const image=new Image();
      try{
        image.src=url;await image.decode();check();
        if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error("ภาพมีความละเอียดสูงเกินไป กรุณาลดขนาดภาพ");
        const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        try{const context=canvas.getContext("2d");if(!context)throw new Error("เตรียมภาพตารางไม่สำเร็จ");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);await encode(canvas);}finally{canvas.width=1;canvas.height=1;}
      }finally{URL.revokeObjectURL(url);image.src="";}
    }
  }
  if(output.reduce((sum,file)=>sum+file.size,0)>3_500_000)throw new Error("ภาพรวมมีขนาดใหญ่เกินไป กรุณาแยกชุดเอกสาร");
  return output;
}
