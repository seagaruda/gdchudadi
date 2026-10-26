/**
 * System Service（Android / Capacitor 单机版）
 * 统一封装：外部连结开启、档案汇出、档案汇入。
 * 本工程仅面向 Android，不再包含 Tauri / Electron 分支。
 */

(function (global) {

    const SystemService = {
        /**
         * 1. 外部连结开启：优先 Capacitor Browser 插件，其次系统浏览器
         * @param {string} url
         */
        async openExternal(url) {
            const cap = typeof window !== 'undefined' ? window.Capacitor : null;
            if (cap && cap.Plugins && cap.Plugins.Browser) {
                try {
                    await cap.Plugins.Browser.open({ url });
                    return;
                } catch (e) {
                    console.warn('[SystemService] Capacitor Browser 失败，回退 window.open', e);
                }
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        },

        /**
         * 2. 档案汇出：Blob + a[download]
         * @param {string} defaultFilename
         * @param {object|string} data
         */
        async writeFile(defaultFilename, data) {
            const contentString = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
            try {
                const blob = new Blob([contentString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return { success: true, type: 'download' };
            } catch (e) {
                console.error('[SystemService] 档案汇出失败', e);
                throw e;
            }
        },

        /**
         * 3. 档案汇入：隐藏 input[type=file] + FileReader
         * @param {object} options - { accept: '.json' }
         */
        async readFile(options = { accept: '.json' }) {
            return new Promise((resolve, reject) => {
                try {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = options.accept || '*';
                    input.style.display = 'none';

                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (!file) {
                            resolve({ success: false, reason: 'cancelled' });
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                resolve({
                                    success: true,
                                    data: JSON.parse(event.target.result),
                                    filename: file.name
                                });
                            } catch (err) {
                                reject(new Error('Invalid JSON file format'));
                            }
                        };
                        reader.onerror = () => reject(new Error('File read error'));
                        reader.readAsText(file);
                    };

                    document.body.appendChild(input);
                    input.click();
                    document.body.removeChild(input);
                } catch (e) {
                    reject(e);
                }
            });
        }
    };

    global.SystemService = SystemService;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SystemService;
    }
})(typeof window !== 'undefined' ? window : this);
