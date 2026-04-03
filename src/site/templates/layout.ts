import { STYLES } from '../styles.ts';

export interface LayoutOptions {
    title: string;
    description: string;
    body: string;
    clientScript?: string;
}

export function renderLayout(opts: LayoutOptions): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title}</title>
<meta name="description" content="${opts.description}">
<meta property="og:title" content="${opts.title}">
<meta property="og:description" content="${opts.description}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<style>
${STYLES}
</style>
</head>
<body>
<div class="container">
${opts.body}
</div>
${opts.clientScript ? `<script>\n${opts.clientScript}\n</script>` : ''}
</body>
</html>`;
}
