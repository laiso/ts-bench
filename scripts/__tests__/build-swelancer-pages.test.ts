import { describe, expect, it } from 'bun:test';
import { descriptionToHtml } from '../build-swelancer-pages.ts';

describe('descriptionToHtml', () => {
    it('unescapes literal \\n sequences from CSV', () => {
        const result = descriptionToHtml('line1\\nline2\\nline3');
        expect(result).toContain('line1');
        expect(result).toContain('line2');
        // Should have actual newlines, not literal \n
        expect(result).not.toContain('\\n');
    });

    it('returns empty string for empty input', () => {
        expect(descriptionToHtml('')).toBe('');
    });

    it('wraps plain text in <pre>', () => {
        const result = descriptionToHtml('hello world');
        expect(result).toContain('<pre');
        expect(result).toContain('hello world');
    });

    it('converts markdown image to <img> tag', () => {
        const result = descriptionToHtml('![alt text](https://example.com/image.png)');
        expect(result).toContain('<img src="https://example.com/image.png" alt="alt text"');
        expect(result).not.toContain('![');
    });

    it('does not double-escape <img> tags on lines with mixed text and image', () => {
        const input = 'See this: ![screenshot](https://example.com/shot.png) for details';
        const result = descriptionToHtml(input);
        // <img should appear as actual tag, not as &lt;img
        expect(result).toContain('<img src="https://example.com/shot.png"');
        expect(result).not.toContain('&lt;img');
    });

    it('does not double-escape text alongside image', () => {
        const input = 'See this: ![shot](https://example.com/x.png) for details';
        const result = descriptionToHtml(input);
        expect(result).toContain('See this:');
        expect(result).toContain('for details');
        expect(result).toContain('<img src="https://example.com/x.png"');
        expect(result).not.toContain('&lt;img');
    });

    it('handles bare image URL', () => {
        const result = descriptionToHtml('https://example.com/photo.jpg');
        expect(result).toContain('<img src="https://example.com/photo.jpg"');
    });

    it('escapes HTML special chars in plain text', () => {
        const result = descriptionToHtml('<script>alert("xss")</script>');
        expect(result).toContain('&lt;script&gt;');
        expect(result).not.toContain('<script>');
    });

    it('handles multiple markdown images on different lines', () => {
        const input = '![a](https://example.com/a.png)\n![b](https://example.com/b.png)';
        const result = descriptionToHtml(input);
        expect(result).toContain('src="https://example.com/a.png"');
        expect(result).toContain('src="https://example.com/b.png"');
        expect(result).not.toContain('&lt;img');
    });
});
