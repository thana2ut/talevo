// A short, free pages.dev address for the existing full-stack Worker.
// Preserve URL, method, body and origin so authentication and CSRF checks work.
const pagesEntry = {
  async fetch(request, env) {
    return env.TALEVO_APP.fetch(request);
  },
};

export default pagesEntry;
