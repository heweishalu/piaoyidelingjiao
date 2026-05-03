// ===== ⚙️ 用户配置 =====
const CONFIG = {
    targetLang: "zh-CN",
    maxLength: 800,        // 单次翻译最大长度
    minLength: 6,
    concurrentLimit: 3,    // 并发限制
    enableCache: true,
};

// ===== 🧠 LRU缓存 =====
const cache = new Map();
const CACHE_LIMIT = 200;

function setCache(key, value) {
    if (!CONFIG.enableCache) return;
    if (cache.size > CACHE_LIMIT) {
        let firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, value);
}

function getCache(key) {
    return cache.get(key);
}

// ===== 🚀 并发控制 =====
let activeRequests = 0;
const queue = [];

function enqueue(task) {
    return new Promise((resolve) => {
        queue.push({ task, resolve });
        runQueue();
    });
}

function runQueue() {
    if (activeRequests >= CONFIG.concurrentLimit || queue.length === 0) return;

    const { task, resolve } = queue.shift();
    activeRequests++;

    task().then((res) => {
        activeRequests--;
        resolve(res);
        runQueue();
    });
}

// ===== 🌐 翻译 =====
function translate(text) {
    let cached = getCache(text);
    if (cached) return Promise.resolve(cached);

    return enqueue(() => {
        return $task.fetch({
            url: "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" + CONFIG.targetLang + "&dt=t&q=" + encodeURIComponent(text)
        }).then(res => {
            try {
                let r = JSON.parse(res.body);
                let t = r[0].map(i => i[0]).join("");

                setCache(text, t);
                return t;
            } catch {
                return "【翻译失败】";
            }
        });
    });
}

// ===== 🧩 文本处理 =====
function shouldTranslate(text) {
    if (!text) return false;
    if (text.length < CONFIG.minLength) return false;
    if (/[\u4e00-\u9fa5]/.test(text)) return false;
    return true;
}

async function processText(text) {
    if (text.length > CONFIG.maxLength) {
        text = text.slice(0, CONFIG.maxLength);
    }

    let t = await translate(text);

    return text + "\n\n———翻译———\n" + t;
}

// ===== 🔍 JSON递归处理 =====
async function processObject(obj) {
    if (!obj) return;

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            await processObject(obj[i]);
        }
    } else if (typeof obj === "object") {
        for (let key in obj) {

            if (["text", "full_text", "body", "selftext"].includes(key)) {
                let val = obj[key];

                if (typeof val === "string" && shouldTranslate(val)) {
                    obj[key] = await processText(val);
                }
            }

            await processObject(obj[key]);
        }
    }
}

// ===== 🧱 主入口 =====
(async () => {
    try {
        let obj = JSON.parse($response.body);

        await processObject(obj);

        $done({ body: JSON.stringify(obj) });

    } catch (e) {
        $done({});
    }
})();