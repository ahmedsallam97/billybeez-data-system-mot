// Existing browser preferences are deliberately independent of operational records.
const THEMES = ["classic", "red", "blue", "orange"];
function readPreferences(storage) {
  let language, theme;
  try { language = storage?.getItem("bbLanguage"); theme = storage?.getItem("bbTheme"); } catch { /* Storage may be unavailable. */ }
  return { language: language === "en" ? "en" : "ar", theme: THEMES.includes(theme) ? theme : "classic" };
}
function applyPreferences(root, preferences) {
  root.lang = preferences.language;
  root.dir = preferences.language === "ar" ? "rtl" : "ltr";
  root.dataset.theme = preferences.theme;
}
function savePreferences(storage, preferences) {
  try { storage.setItem("bbLanguage", preferences.language); storage.setItem("bbTheme", preferences.theme); } catch { /* Still apply in this session. */ }
}
// Executed in <head> before paint. No account data or secrets enter this script.
// Keep this script literal: serializing a function with toString() would capture
// variable names renamed by the production minifier without their bindings.
const preferenceBootstrap = `(()=>{let language="ar",theme="classic";try{if(localStorage.getItem("bbLanguage")==="en")language="en";const stored=localStorage.getItem("bbTheme");if(${JSON.stringify(THEMES)}.includes(stored))theme=stored}catch{}const root=document.documentElement;root.lang=language;root.dir=language==="ar"?"rtl":"ltr";root.dataset.theme=theme})()`;
module.exports = { THEMES, readPreferences, applyPreferences, savePreferences, preferenceBootstrap };
