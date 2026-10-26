/**
 * License Service（Android / 单机版）
 * 本工程仅面向 Android（Capacitor），不再包含 Microsoft Store / Tauri / Electron 授权流程。
 * 单机版语义：始终为完整版，无试用期限制。
 */

(function (global) {
    const BUILD_TARGET = 'GITHUB';           // 仅用于设置页文案分支（非 STORE）
    const HUAWEI_STORE_URL = 'https://appgallery.huawei.com/';

    const FULL_VERSION = Object.freeze({
        isActive: true,
        isTrial: false,
        trialDaysRemaining: 0
    });

    let cachedStatus = null;
    let cachedBuildTarget = null;

    const LicenseService = {
        /** 初始化：写入缓存（同步返回，无需等待原生端） */
        async init() {
            cachedBuildTarget = BUILD_TARGET;
            cachedStatus = { ...FULL_VERSION };
            if (typeof window !== 'undefined') window.BuildTarget = cachedBuildTarget;
            return cachedStatus;
        },

        /** 取得建置目标（单机版固定为非 STORE） */
        getBuildTarget() {
            return cachedBuildTarget || BUILD_TARGET;
        },

        /** 非同步取得授权状态 */
        async getLicenseStatus() {
            cachedStatus = { ...FULL_VERSION };
            return cachedStatus;
        },

        /** 同步取得授权状态（渲染线程用，避免异步卡顿） */
        getLicenseStatusSync() {
            return cachedStatus || { ...FULL_VERSION };
        },

        /** 打开应用市场页（Android：交给系统浏览器） */
        async openStore() {
            if (typeof SystemService !== 'undefined') {
                SystemService.openExternal(HUAWEI_STORE_URL);
                return;
            }
            window.open(HUAWEI_STORE_URL, '_blank');
        }
    };

    global.LicenseService = LicenseService;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LicenseService;
    }
})(typeof window !== 'undefined' ? window : this);
