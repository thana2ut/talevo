import app from "vinext/server/fetch-handler";
import { checkRequestBoundary } from "./request-boundary.mjs";
export * from "vinext/server/fetch-handler";

const appEntry = {
  async fetch(request, env, ctx) {
    const rejected = await checkRequestBoundary(request, env);
    return rejected ?? app.fetch(request, env, ctx);
  },
};
export default appEntry;
