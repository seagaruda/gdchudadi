/**
 * 橘猫表情雪碧图配置 (Sprite Sheet Metadata)
 * 大图尺寸 800 x 400，完美平铺为 4 x 2 网格，每格单张贴图为 200 x 200。
 * 
 * 索引与大图中的网格座标对应关系：
 * Row 0: 0, 1, 2, 3
 * Row 1: 4, 5, 6, 7
 */
const stickersMetadata = [
    {
        index: 0,
        name: "绝望崩溃",
        description: "极度逆风、濒临落败的绝望表情",
        xRange: [-1.0, -0.5],
        yRange: [0.5, 1.0],
        grid: { row: 0, col: 0 }
    },
    {
        index: 1,
        name: "无奈憋屈",
        description: "手牌普通但局势稍微不利，感到无奈低调的表情",
        xRange: [-0.5, 0.0],
        yRange: [0.0, 0.5],
        grid: { row: 0, col: 1 }
    },
    {
        index: 2,
        name: "狂喜嚣张",
        description: "极度顺风、听牌或即将获胜的嚣张大笑",
        xRange: [0.5, 1.0],
        yRange: [0.6, 1.0],
        grid: { row: 0, col: 2 }
    },
    {
        index: 3,
        name: "惊恐霹雳",
        description: "局势不妙、被对手出大牌突袭时的惊恐表情",
        xRange: [-1.0, -0.3],
        yRange: [0.0, 0.5],
        grid: { row: 0, col: 3 }
    },
    {
        index: 4,
        name: "心机观察",
        description: "局势均势，正在内敛算牌、暗中观察的平静心机表情",
        xRange: [-0.3, 0.3],
        yRange: [0.0, 0.4],
        grid: { row: 1, col: 0 }
    },
    {
        index: 5,
        name: "挑衅挖苦",
        description: "稍微顺风，对其他玩家进行挖苦或挑衅的表情",
        xRange: [0.2, 0.6],
        yRange: [0.5, 0.9],
        grid: { row: 1, col: 1 }
    },
    {
        index: 6,
        name: "愤怒抓狂",
        description: "极度逆风且情绪张力高涨，愤怒拍桌抓狂的表情",
        xRange: [-1.0, -0.6],
        yRange: [0.7, 1.0],
        grid: { row: 1, col: 2 }
    },
    {
        index: 7,
        name: "期待祈祷",
        description: "中性偏顺风，心怀期待、祈祷拿到好牌或对手放水的表情",
        xRange: [0.0, 0.5],
        yRange: [0.3, 0.7],
        grid: { row: 1, col: 3 }
    }
];

class DynamicAvatar {
    /**
     * @param {HTMLCanvasElement} canvas 目标 Canvas 节点
     * @param {string} spriteUrl 雪碧图的图片路径
     * @param {Object} options 配置选项
     * @param {Function} options.onStateChange 当表情 index 改变时的回呼函式 (传入最新 state 物件)
     * @param {Function} options.onTensionChange 当 Y 轴张力值改变时的回呼函式 (传入 y 值)
     */
    constructor(canvas, spriteUrl, options = {}) {
        if (!canvas) throw new Error("必须提供有效的 HTMLCanvasElement 节点。");
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.spriteUrl = spriteUrl;
        
        // 回呼函数
        this.onStateChange = options.onStateChange || null;
        this.onTensionChange = options.onTensionChange || null;

        // 贴图尺寸定义
        this.spriteWidth = 800;
        this.spriteHeight = 400;
        this.cols = 4;
        this.rows = 2;
        this.cellWidth = 200;
        this.cellHeight = 200;

        // 目前状态
        this.currentX = 0;
        this.currentY = 0;
        this.currentIndex = -1; // 初始设为 -1 确保第一次渲染成功触发
        
        // 载入雪碧图 (加入随机参数防止浏览器快取旧图)
        this.isLoaded = false;
        this.spriteImage = new Image();
        this.spriteImage.src = spriteUrl + (spriteUrl.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
        this.spriteImage.onload = () => {
            this.isLoaded = true;
            // 动态根据载入的图片真实尺寸，计算每格的宽高，确保任何解析度都能完美裁剪 4x2 网格
            this.cellWidth = this.spriteImage.width / this.cols;
            this.cellHeight = this.spriteImage.height / this.rows;
            // 载入完成后依据目前座标执行首次绘制
            this.draw();
        };
        this.spriteImage.onerror = (err) => {
            console.error("无法载入表情雪碧图:", err);
        };
    }

    /**
     * 更新玩家心理状态指标 (X, Y)
     * @param {number} x 局势顺逆值 (-1.0 至 1.0)
     * @param {number} y 互动张力值 (0.0 至 1.0)
     */
    updatePsychologicalState(x, y) {
        // 1. 数值范围限制 (Clamping)
        const clampedX = Math.max(-1.0, Math.min(1.0, x));
        const clampedY = Math.max(0.0, Math.min(1.0, y));

        this.currentX = clampedX;
        this.currentY = clampedY;

        // 触发张力改变回呼（供外部 UI 效果，如闪烁或震动使用）
        if (this.onTensionChange) {
            this.onTensionChange(clampedY);
        }

        // 2. 核心演算法：寻找符合的表情
        const matchedIndex = this.findMatchingStickerIndex(clampedX, clampedY);

        // 3. 效能优化 (重绘防手震)：只有在 index 改变时才重新绘制
        if (matchedIndex !== this.currentIndex) {
            this.currentIndex = matchedIndex;
            
            // 触发表情改变回呼
            if (this.onStateChange) {
                const stateObj = stickersMetadata.find(s => s.index === matchedIndex);
                this.onStateChange(stateObj);
            }

            this.draw();
        }
    }

    /**
     * 核心演算法：寻找符合目前 (x, y) 的表情索引
     * @param {number} x 
     * @param {number} y 
     * @returns {number} 匹配到的表情 index
     */
    findMatchingStickerIndex(x, y) {
        // 找出所有区间包含 (x, y) 的候选表情
        const candidates = stickersMetadata.filter(sticker => {
            const inX = x >= sticker.xRange[0] && x <= sticker.xRange[1];
            const inY = y >= sticker.yRange[0] && y <= sticker.yRange[1];
            return inX && inY;
        });

        // 情况 A：若有唯一的匹配，直接回传
        if (candidates.length === 1) {
            return candidates[0].index;
        }

        // 情况 B：若同时符合多张（边界重叠），以「张力 Y 轴中点距离较近者」优先
        if (candidates.length > 1) {
            let bestCandidate = candidates[0];
            let minDistance = Infinity;

            candidates.forEach(cand => {
                const yMidpoint = (cand.yRange[0] + cand.yRange[1]) / 2;
                const dist = Math.abs(y - yMidpoint);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestCandidate = cand;
                }
            });
            return bestCandidate.index;
        }

        // 情况 C：若没有任何表情完全符合 (边界外或空隙)，则寻找距离最近的表情
        // 计算 (x, y) 到各表情中心点的 2D 欧几里得距离
        let closestSticker = stickersMetadata[4]; // 预设为心机观察 (index: 4)
        let minDistance = Infinity;

        stickersMetadata.forEach(sticker => {
            const xMid = (sticker.xRange[0] + sticker.xRange[1]) / 2;
            const yMid = (sticker.yRange[0] + sticker.yRange[1]) / 2;
            const dist = Math.sqrt(Math.pow(x - xMid, 2) + Math.pow(y - yMid, 2));
            if (dist < minDistance) {
                minDistance = dist;
                closestSticker = sticker;
            }
        });

        return closestSticker.index;
    }

    /**
     * 执行画布裁切与绘制
     */
    draw() {
        if (!this.isLoaded || this.currentIndex === -1) return;

        const sticker = stickersMetadata.find(s => s.index === this.currentIndex);
        if (!sticker) return;

        const { row, col } = sticker.grid;

        // 计算在大图中的像素座标
        const sx = col * this.cellWidth;
        const sy = row * this.cellHeight;

        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 使用平滑渲染模式
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";

        // 将头像完美地填满 Canvas (支援内部缩放)
        this.ctx.drawImage(
            this.spriteImage,
            sx, sy, this.cellWidth, this.cellHeight, // 来源裁切区
            0, 0, this.canvas.width, this.canvas.height // 目标绘制区
        );
    }

    /**
     * 导出当前单张头像为 Base64 字串
     * @returns {string} Base64 PNG 图片资料 URL
     */
    exportCurrentAvatar() {
        return this.canvas.toDataURL("image/png");
    }
}

// 支援浏览器全域载入与 ES6 模组汇出
if (typeof module !== "undefined" && module.exports) {
    module.exports = { DynamicAvatar, stickersMetadata };
} else {
    window.DynamicAvatar = DynamicAvatar;
    window.stickersMetadata = stickersMetadata;
}
