const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const postcss = require('postcss');
const { readPreferences, savePreferences, preferenceBootstrap } = require('../lib/ui-preferences');
test('preferences validate stored values and survive unavailable browser storage', () => {
  assert.deepEqual(readPreferences({ getItem: () => 'invalid' }), { language: 'ar', theme: 'classic' });
  assert.deepEqual(readPreferences({ getItem: () => { throw Error('denied'); } }), { language: 'ar', theme: 'classic' });
  assert.doesNotThrow(() => savePreferences({ setItem: () => { throw Error('quota'); } }, { language: 'en', theme: 'blue' }));
});
test('pre-paint bootstrap applies every saved theme and direction without an API or account data', () => {
  for (const language of ['en', 'ar']) for (const theme of ['classic', 'blue', 'orange', 'red']) {
    const root = { dataset: {} };
    vm.runInNewContext(preferenceBootstrap, { document: { documentElement: root }, localStorage: { getItem: key => key === 'bbLanguage' ? language : theme } });
    assert.equal(root.lang, language); assert.equal(root.dir, language === 'ar' ? 'rtl' : 'ltr'); assert.equal(root.dataset.theme, theme);
  }
  const root = { dataset: {} }; vm.runInNewContext(preferenceBootstrap, { document: { documentElement: root } });
  assert.equal(root.dataset.theme, 'classic');
});
test('bootstrap remains self-contained when the production minifier renames module variables', async () => {
  const { minify } = require('next/dist/compiled/terser');
  const compiled = await minify(fs.readFileSync('lib/ui-preferences.js','utf8'), { compress:true, mangle:{toplevel:true} });
  const exported = { exports:{} }; vm.runInNewContext(compiled.code, { module:exported });
  const root = { dataset:{} };
  vm.runInNewContext(exported.exports.preferenceBootstrap, { document:{documentElement:root}, localStorage:{getItem:key=>key==='bbLanguage'?'en':'blue'} });
  assert.equal(root.lang,'en'); assert.equal(root.dir,'ltr'); assert.equal(root.dataset.theme,'blue');
});
const luminance = color => {
  const channels = color.match(/[a-f0-9]{2}/gi).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
test('all four theme token sets provide accessible text contrast and print-independent definitions', () => {
  const ast = postcss.parse(fs.readFileSync('app/themes.css', 'utf8'));
  const pairs = [['primary', 'primary-fg'], ['topbar-bg', 'topbar-fg'], ['sidebar-bg', 'sidebar-muted'], ['sidebar-end', 'sidebar-fg'], ['sidebar-active-bg', 'sidebar-active-fg'], ['card-icon-bg', 'card-icon-fg'], ['featured-bg', 'featured-fg'], ['selected-bg', 'selected-fg'], ['button-bg', 'button-fg'], ['surface', 'accent-text'], ['surface', 'link'], ['bg', 'accent-text'], ['surface', 'muted']];
  for (const theme of ['classic', 'blue', 'orange', 'red']) {
    let rule; ast.walkRules(r => { if (r.selector.includes(`data-theme="${theme}"`)) rule = r; });
    assert.ok(rule); assert.equal(rule.parent.params, 'screen');
    const tokens = Object.fromEntries(rule.nodes.map(d => [d.prop.replace('--theme-', ''), d.value]));
    for (const [bg, fg] of pairs) { const a = luminance(tokens[bg]), b = luminance(tokens[fg]); assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5, `${theme}: ${bg}/${fg}`); }
  }
});
