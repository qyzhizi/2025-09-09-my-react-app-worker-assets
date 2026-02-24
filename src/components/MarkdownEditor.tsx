import React, { useEffect, useRef } from "react";
import "@/assets/cm6Editor/chunmde.bundle.min.js";

const { 
  createChunEditor, 
  createImageUploadPlugin, 
  createMarkdownPreviewPlugin, 
  githubPreviewConfig, 
  // darkPreviewConfig 
} = (window as any).Chun;

interface EditorProps {
  containerId?: string;
  value: string;                          // React passed in value
  onChange: (value: string) => void;      // React's onChange callback
}

const MarkdownEditor: React.FC<EditorProps> = ({
  containerId = "editor-container",
  value,
  onChange,
}) => {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    // Image upload plugin
    const imageUploadPlugin = createImageUploadPlugin({
      imageUploadUrl: "", 
      imageFormats: [
        "image/jpg",
        "image/jpeg",
        "image/gif",
        "image/png",
        "image/bmp",
        "image/webp",
      ],
    });

    // Markdown preview plugin
    const markdownPreviewPlugin = createMarkdownPreviewPlugin(githubPreviewConfig);

    // Initialize editor
    const editor = createChunEditor({
      doc: value || "",
      lineWrapping: true,
      indentWithTab: true,
      toolbar: true,
      theme: "auto", // "light" | "dark" | "auto"
    })
      .use(imageUploadPlugin)
      .use(markdownPreviewPlugin)
      .mount(containerId);

    editorRef.current = editor;

    // Listen for content changes and callback to React
    editor.on("change", () => {
      const content = editor.getValue();
      onChange(content);
    });

    return () => {
      if (editorRef.current && editorRef.current.destroy) {
        editorRef.current.destroy();
      }
    };
  }, [containerId]);

  // Controlled update: when value changes, manually update the editor
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.getValue()) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  return <div id={containerId} className="w-full" />;
};

export default MarkdownEditor;
