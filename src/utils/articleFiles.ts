export const ALLOWED_ARTICLE_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

export const ALLOWED_ARTICLE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

const STORAGE_URL_MARKERS = [
  '/storage/v1/object/public/articles/',
  '/storage/v1/object/sign/articles/',
  '/storage/v1/object/authenticated/articles/',
] as const;

export const isSupportedArticleFile = (file: File): boolean => {
  const filename = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_ARTICLE_EXTENSIONS.some((ext) => filename.endsWith(ext));
  const hasAllowedMime = ALLOWED_ARTICLE_MIME_TYPES.includes(
    file.type as (typeof ALLOWED_ARTICLE_MIME_TYPES)[number],
  );

  // Some browsers may not send MIME type for local documents.
  return hasAllowedExtension || hasAllowedMime;
};

export const getStoragePathFromFileUrl = (fileUrl: string): string | null => {
  if (!fileUrl) return null;

  if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
    return fileUrl;
  }

  try {
    const parsed = new URL(fileUrl);
    const marker = STORAGE_URL_MARKERS.find((item) => parsed.pathname.includes(item));
    if (!marker) return null;

    const pathIndex = parsed.pathname.indexOf(marker) + marker.length;
    return decodeURIComponent(parsed.pathname.slice(pathIndex));
  } catch {
    return null;
  }
};

export const sanitizeFilename = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

