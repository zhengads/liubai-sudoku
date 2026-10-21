const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src');
const dist = path.join(root, 'dist');

fs.mkdirSync(dist, { recursive: true });
for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
  if (entry.isFile()) fs.copyFileSync(path.join(source, entry.name), path.join(dist, entry.name));
}
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

// Also provide a self-contained document for downloads and offline play.
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
html = html.replace(
  /<link\b[^>]*href="style\.css"[^>]*>/,
  () => '<style>\n' + fs.readFileSync(path.join(source, 'style.css'), 'utf8') + '\n</style>',
);
html = html.replace(
  /<link\b[^>]*href="icon\.svg"[^>]*>/,
  () =>
    '<link rel="icon" href="data:image/svg+xml;base64,' +
    fs.readFileSync(path.join(source, 'icon.svg')).toString('base64') +
    '" type="image/svg+xml">',
);
const scripts = [];
html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, name) => {
  scripts.push(fs.readFileSync(path.join(source, name), 'utf8'));
  return '';
});
html = html.replace('href="./"', 'href="#"');
html = html.replace('</body>', () => '<script>\n' + scripts.join('\n;\n') + '\n</script>\n</body>');
for (const output of [path.join(dist, 'play.html'), path.join(root, '留白数独.html')]) {
  fs.writeFileSync(output, html);
}
console.log(`Built dist/ and offline HTML (${Buffer.byteLength(html)} bytes).`);
