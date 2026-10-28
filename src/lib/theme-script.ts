/** Storage key shared by the bootstrap script and the client preference helpers. */
export const THEME_STORAGE_KEY = "startupos.theme.v1";

/** Runs before first paint so the stored theme is applied without a flash. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
