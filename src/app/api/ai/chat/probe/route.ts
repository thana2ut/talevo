import { secureApi } from "@/lib/security/api-guard";
import { createAIChatProbeHandler } from "@/lib/ai/chat-probe-handler";

export const dynamic = "force-dynamic";

const handlerPOST = createAIChatProbeHandler();

export const POST = secureApi(handlerPOST, "/api/ai/chat/probe", "POST");
