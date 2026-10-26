const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(__dirname, '..', 'www');

console.log('[Sync-WWW] 开始同步最新的网页资源至 www/ 目录...');

try {
    // 1. 清理旧的 www/src 目录并重新建立
    const destSrc = path.join(dest, 'src');
    if (fs.existsSync(destSrc)) {
        fs.rmSync(destSrc, { recursive: true, force: true });
    }
    fs.mkdirSync(destSrc, { recursive: true });

    // 2. 复制主 HTML 与脚本
    const filesToCopy = ['index.html', 'about.html'];
    for (const file of filesToCopy) {
        const srcFile = path.join(root, file);
        const destFile = path.join(dest, file);
        if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, destFile);
        }
    }

    // 3. 递回复制 src 目录到 www/src
    const srcFolder = path.join(root, 'src');
    if (fs.existsSync(srcFolder)) {
        fs.cpSync(srcFolder, destSrc, { recursive: true });
    }

    console.log('[Sync-WWW] 同步完成！');
} catch (err) {
    console.error('[Sync-WWW] 同步失败:', err);
    process.exit(1);
}
