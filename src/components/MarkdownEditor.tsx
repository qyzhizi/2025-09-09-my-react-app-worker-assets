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
  value: string;                          // React 传入的值
  onChange: (value: string) => void;      // React 的 onChange 回调
}

const MarkdownEditor: React.FC<EditorProps> = ({
  containerId = "editor-container",
  value,
  onChange,
}) => {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    // 图片上传插件
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

    // Markdown 预览插件
    const markdownPreviewPlugin = createMarkdownPreviewPlugin(githubPreviewConfig);

    // 初始化编辑器
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

    // 监听内容变化，回调给 React
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

  // 受控更新：当 value 改变时，手动更新编辑器
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.getValue()) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  return <div id={containerId} className="w-full" />;
};

export default MarkdownEditor;
