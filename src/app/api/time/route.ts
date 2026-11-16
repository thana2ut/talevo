import { secureApi } from "@/lib/security/api-guard";
import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
function handlerGET(){return NextResponse.json({now:Date.now(),timezone:"Asia/Bangkok"},{headers:{"Cache-Control":"no-store, max-age=0"}});}

export const GET = secureApi(handlerGET, "/api/time", "GET");
