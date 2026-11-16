import { secureApi } from "@/lib/security/api-guard";
import { createAIChatHandler } from "@/lib/ai/chat-handler";

export const dynamic = "force-dynamic";

const handlerPOST = createAIChatHandler();

export const POST = secureApi(handlerPOST, "/api/ai/chat", "POST");
