import type { AttachedFile } from "../types";

export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function fileToAttachment(file: File): Promise<AttachedFile> {
  const data = await fileToBase64(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    data,
    media_type: file.type,
    preview_url: `data:${file.type};base64,${data}`,
  };
}
