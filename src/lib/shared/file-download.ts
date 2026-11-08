/** Сохраняет blob как файл через временную ссылку `a[download]`. */
export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
        anchor.click();
    } finally {
        anchor.remove();
        // Отзываем после текущей задачи: некоторые браузеры начинают скачивание асинхронно.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}
