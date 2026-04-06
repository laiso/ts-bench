import { describe, it, expect } from 'bun:test';
import { summarizeDiff } from '../reset';

describe('summarizeDiff', () => {
    it('reports a single file changed with insertions and deletions', () => {
        const diff = [
            'diff --git a/src/foo.ts b/src/foo.ts',
            'index abc..def 100644',
            '--- a/src/foo.ts',
            '+++ b/src/foo.ts',
            '@@ -1,3 +1,4 @@',
            ' unchanged',
            '-removed line',
            '+added line 1',
            '+added line 2',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('1 file changed, 2 insertions(+), 1 deletion(-)');
    });

    it('reports multiple files changed', () => {
        const diff = [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
            'diff --git a/src/b.ts b/src/b.ts',
            '--- a/src/b.ts',
            '+++ b/src/b.ts',
            '@@ -1 +1 @@',
            '+line',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('2 files changed, 2 insertions(+), 1 deletion(-)');
    });

    it('omits insertions section when there are none', () => {
        const diff = [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,2 +1,1 @@',
            '-removed 1',
            '-removed 2',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('1 file changed, 2 deletions(-)');
    });

    it('omits deletions section when there are none', () => {
        const diff = [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,0 +1,1 @@',
            '+added',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('1 file changed, 1 insertion(+)');
    });

    it('uses singular for exactly one insertion and one deletion', () => {
        const diff = [
            'diff --git a/x.ts b/x.ts',
            '--- a/x.ts',
            '+++ b/x.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('1 file changed, 1 insertion(+), 1 deletion(-)');
    });

    it('does not double-count the same file across multiple hunks', () => {
        const diff = [
            'diff --git a/src/foo.ts b/src/foo.ts',
            '--- a/src/foo.ts',
            '+++ b/src/foo.ts',
            '@@ -1 +1 @@',
            '-a',
            '+b',
            '@@ -10 +10 @@',
            '-c',
            '+d',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('1 file changed, 2 insertions(+), 2 deletions(-)');
    });

    it('ignores +++ and --- header lines', () => {
        const diff = [
            'diff --git a/src/foo.ts b/src/foo.ts',
            '--- a/src/foo.ts',
            '+++ b/src/foo.ts',
            '@@ -1 +1 @@',
            '+real insertion',
        ].join('\n');

        expect(summarizeDiff(diff)).toBe('1 file changed, 1 insertion(+)');
    });
});
