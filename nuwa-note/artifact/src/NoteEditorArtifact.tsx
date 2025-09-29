import Editor from './components';
import 'prosekit/basic/style.css';
import 'prosekit/basic/typography.css';
import { useNuwa } from '@nuwa-ai/ui-kit';
import { createEditor } from 'prosekit/core';
import { useEffect, useMemo } from 'react';
import { defineExtension } from './components/extension';
import { htmlFromMarkdown, markdownFromHTML } from './components/markdown';
import { useNoteMCP } from './hooks/use-note-mcp';

export function NoteEditorArtifact() {
    // Create a single ProseKit editor instance
    const editor = useMemo(() => {
        const extension = defineExtension();
        return createEditor({ extension });
    }, []);

    // Connect to Nuwa Client on mount and obtain nuwa client methods
    const { nuwa } = useNuwa();

    // Start MCP server for Nuwa Client to connect (ProseKit-compatible)
    useNoteMCP(editor, nuwa);

    // On change, serialize the current document to HTML, then to markdown for persistence
    const handleOnChange = async () => {
        const html = editor.getDocHTML();
        const markdown = markdownFromHTML(html);
        nuwa.saveState(markdown);
    };

    // On mount, set the content to the editor
    useEffect(() => {
        nuwa.getState().then((savedState) => {
            const html = htmlFromMarkdown(savedState);
            editor.setContent(html);
        });
    }, [editor, nuwa]);

    return (
        <Editor editor={editor} onDocChange={handleOnChange} />
    );
}