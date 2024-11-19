const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const readline = require('readline');

// 建立命令行輸入介面
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promise 包裝的使用者輸入函數
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

class Auth {
    constructor() {
        this.cookiesPath = './cookies/';
    }

    // 確保 cookies 目錄存在
    async ensureCookiesDirectory() {
        try {
            await fs.mkdir(this.cookiesPath, { recursive: true });
        } catch (error) {
            console.log('Cookie 目錄已存在');
        }
    }

    // 保存 cookies
    async saveCookies(platform) {
        const cookies = await this.page.cookies();
        await fs.writeFile(
            `${this.cookiesPath}${platform}_cookies.json`,
            JSON.stringify(cookies, null, 2)
        );
        console.log(`${platform} cookies 已保存`);
    }

    // 載入 cookies
    async loadCookies(platform) {
        try {
            const cookiesString = await fs.readFile(
                `${this.cookiesPath}${platform}_cookies.json`,
                'utf8'
            );
            const cookies = JSON.parse(cookiesString);
            await this.page.setCookie(...cookies);
            //console.log(`${platform} cookies 載入成功`);
            return true;
        } catch (error) {
            console.log(`無法載入 ${platform} cookies:`, error.message);
            return false;
        }
    }

    // Instagram 登入處理
    async instagramLogin(username, password) {
        try {
            await this.page.goto('https://www.instagram.com/accounts/login/', {
                waitUntil: 'networkidle0'
            });

            // 檢查是否已經登入
            const isLoggedIn = await this.page.$('input[name="username"]') === null;
            if (isLoggedIn) {
                console.log('已經登入 Instagram');
                return true;
            }

            // 輸入帳號密碼
            await this.page.type('input[name="username"]', username);
            await this.page.type('input[name="password"]', password);
            await this.page.click('button[type="submit"]');

            // 等待可能的 2FA 驗證碼輸入框
            try {
                await this.page.waitForSelector('input[name="verificationCode"]', {
                    timeout: 10000
                });
                console.log('需要 2FA 驗證');

                // 要求使用者輸入驗證碼
                const verificationCode = await question('請輸入 Instagram 2FA 驗證碼: ');
                await this.page.type('input[name="verificationCode"]', verificationCode);
                await this.page.click('button[type="button"]');
            } catch (error) {
                console.log('不需要 2FA 驗證或已通過');
            }

            // 等待登入完成
            await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
            await this.saveCookies('instagram');
            return true;

        } catch (error) {
            console.error('Instagram 登入失敗:', error);
            return false;
        }
    }

    // 主要執行函數
    async run() {
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--start-maximized',
                '--disable-notifications'
            ]
        });

        this.page = await browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });
        await this.ensureCookiesDirectory();

        // Instagram 登入流程
        let instagramLoggedIn = await this.loadCookies('instagram');
        if (!instagramLoggedIn) {
            const igUsername = await question('請輸入 Instagram 帳號: ');
            const igPassword = await question('請輸入 Instagram 密碼: ');
            instagramLoggedIn = await this.instagramLogin(igUsername, igPassword);
        }

        rl.close();
        return {browser, page: this.page};
    }
}

class Monitor {
    constructor(page) {
        this.page = page;
        this.observer = null;
        this.resSuccess = 0;
        this.resFail = 0;
        this.isMonitoring = false;
        this.logFile = './log/messages.log';

        // 監聽所有 console 訊息
        //this.page.on('console', msg => {
        //    console.log('Browser console:', msg.text());
        //});
    }

    async cleanup() {
        this.isMonitoring = false;
        if (this.observer) {
            await this.page.evaluate(() => {
                if (window.messageObserver) {
                    window.messageObserver.disconnect();
                    window.messageObserver = null;
                }
            });
            this.observer = null;
        }
    }

    async logMessage(message) {
        const timestamp = new Date().toLocaleString();
        const logEntgry = `[${timestamp}] ${message}`;
        await fs.appendFile(this.logFile, logEntgry + '\n');
        //console.log(logEntgry.trim());
    }

    async sendMessage(message) {
        this.input = message;
        try {
            //console.log('開始發送訊息流程...');
            
            // 1. 等待輸入框出現
            const selector = 'div[contenteditable="true"][role="textbox"]';
            await this.page.waitForSelector(selector);
            
            // 2. 點擊輸入框
            await this.page.click(selector);
            
            // 3. 使用 setTimeout 取代 waitForTimeout
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 4. 輸入訊息
            await this.page.keyboard.type(message);
            
            // 5. 再次等待
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 6. 按下 Enter 發送
            await this.page.keyboard.press('Enter');
            
            // 7. 等待訊息送出
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            //console.log('訊息已發送:', message);
            return true;
            
        } catch (error) {
            console.error('發送訊息失敗:', error);
            
            // 診斷資訊
            try {
                const elementExists = await this.page.evaluate(() => {
                    const textbox = document.querySelector('div[contenteditable="true"][role="textbox"]');
                    return {
                        exists: !!textbox,
                        value: textbox ? textbox.textContent : null,
                        activeElement: document.activeElement.tagName,
                        activeElementRole: document.activeElement.getAttribute('role')
                    };
                });
                console.log('診斷資訊:', elementExists);
            } catch (e) {
                console.error('無法取得診斷資訊:', e);
            }
            
            return false;
        }
    }

    async openUrl() {
        try {
            // 監控 Direct Messages
            await this.page.goto('https://www.instagram.com/direct/t/17844930656636725/', {
                waitUntil: 'networkidle0'
            });
        } catch (error) {
            console.error('打開網址失敗:', error);
            throw error;
        }
    }

    async monitorMessage(responseType) {
        this.responseType = responseType;
        try {
            await fs.mkdir('./log', { recursive: true });

            // 1. 檢查 DOM 元素是否存在
            //const hasMessageContainer = await this.page.evaluate(() => {
            //    const container = document.querySelector('div[role="grid"]');
            //    console.log('Message container found:', !!container); // 瀏覽器內的 log
            //    return {
            //        exists: !!container,
            //        role: container?.getAttribute('role'),
            //        childCount: container?.childNodes.length
            //    };
            //});
            //console.log('Container status:', hasMessageContainer); // Node.js 內的 log

            // 2. 驗證 Observer 設置
            //const observerStatus = await this.page.evaluate(() => {
            //    try {
            //        const targetString = '抱歉';
            //        let observerWorking = false;
            //        
            //        // 測試用的監聽器
            //        const testObserver = new MutationObserver((mutations) => {
            //            console.log('Observer triggered:', mutations.length);
            //            observerWorking = true;
            //        });
            //        
            //        const messageContainer = document.querySelector('div[role="grid"]');
            //        if (!messageContainer) {
            //            throw new Error('Container not found');
            //        }
            //        
            //        testObserver.observe(messageContainer, {
            //            childList: true,
            //            subtree: true
            //        });
            //        
            //        // 模擬一個 DOM 變化來測試 Observer
            //        const testDiv = document.createElement('div');
            //        testDiv.textContent = 'Test message';
            //        messageContainer.appendChild(testDiv);
            //        
            //        // 清理測試用的 Observer
            //        setTimeout(() => {
            //            testObserver.disconnect();
            //            testDiv.remove();
            //        }, 100);
            //        
            //        return {
            //            status: 'Observer setup success',
            //            containerFound: true,
            //            observerWorking
            //        };
            //    } catch (error) {
            //        return {
            //            status: 'Observer setup failed',
            //            error: error.message
            //        };
            //    }
            //});
            //console.log('Observer setup status:', observerStatus);

            // 3. 監控實際訊息處理
            this.isMonitoring = true;
            await this.page.evaluate(() => {
                // 使用 debug object 來追蹤狀態
                window.debugInfo = {
                    messagesProcessed: 0,
                    apologyFound: 0,
                    lastMessageText: '',
                    errors: []
                };
                
                const observer = new MutationObserver((mutations) => {
                    try {
                        mutations.forEach((mutation) => {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const messages = node.querySelectorAll('div[role="row"]');
                                    window.debugInfo.messagesProcessed += messages.length;
                                    
                                    messages.forEach((message) => {
                                        const text = message.textContent;
                                        window.debugInfo.lastMessageText = text;
                                        window.debugInfo.apologyFound++;
                                        window.latestMessage = {
                                            text: text,
                                            timestamp: new Date().toISOString()
                                        };
                                    });
                                }
                            });
                        });
                    } catch (error) {
                        window.debugInfo.errors.push(error.message);
                        console.error('Observer error:', error);
                    }
                });

                const messageContainer = document.querySelector('div[role="grid"]');
                if (messageContainer) {
                    observer.observe(messageContainer, {
                        childList: true,
                        subtree: true
                    });
                    //console.log('Observer started monitoring');
                } else {
                    //console.error('Message container not found');
                }
            });

            // 4. 定期檢查 debug 資訊
            const targetStr = '阿羅哈您好';
            const targetStr2 = '阿羅哈愛爾麗';
            const targetStr3 = '阿羅哈Hi!';
            const waitStr = '你傳送了IGD';
            while (this.isMonitoring) {
                const debugInfo = await this.page.evaluate(() => {
                    const info = window.debugInfo;
                    // 重置某些計數器
                    window.debugInfo.messagesProcessed = 0;
                    return info;
                });
                
                //console.log('Debug info:', debugInfo);
                //console.log('.');
                
                // 檢查是否有錯誤
                if (debugInfo.errors.length > 0) {
                    await this.logMessage(`監控出現錯誤: ${debugInfo.errors.join(', ')}`);
                }

                const msg = await this.page.evaluate(() => {
                    const message = window.latestMessage;
                    window.latestMessage = null;
                    return message;
                });

                if (msg != null) {
                    if (msg.text.startsWith(waitStr)) {
                        //do nothing
                        this.logMessage(`Waitting response...`);
                    } else if (
                        (this.responseType == 'A') &&
                        ["介紹", "hi"].includes(this.input) &&
                        (msg.text.startsWith(targetStr) || msg.text.startsWith(targetStr2))
                    ) {
                        //pass
                        this.resSuccess++;

                        this.logMessage(`Type ${this.responseType} : ${this.input} - O`);
                        await this.sendMessage('hi');
                    } else if (
                        (this.responseType == 'B') &&
                        (
                            ((this.input == '介紹') && (msg.text.startsWith(targetStr) || msg.text.startsWith(targetStr2))) ||
                            ((this.input == 'hi') && msg.text.startsWith(targetStr3))
                        )
                    ) {
                        //pass
                        this.resSuccess++;

                        this.logMessage(`Type ${this.responseType} : ${this.input} - O`);
                        await this.sendMessage('hi');
                    } else {
                        //fail
                        this.resFail++;

                        this.logMessage(`Type ${this.responseType} : ${this.input} - X`);
                    }
                }

                if (this.resSuccess + this.resFail >= 2) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return [this.resSuccess, this.resFail];
        } catch (error) {
            console.error('監控訊息時發生錯誤:', error);
            await this.logMessage(`監控訊息時發生錯誤: ${error.message}`);
            throw  error;
        }
    }
}

async function main() {
    let browser;
    let monitor;

    try {
        const auth = new Auth();
        const result = await auth.run();
        browser = result.browser;
        monitor = new Monitor(result.page);
        responseType = process.argv[2];

        await monitor.openUrl();
        await monitor.sendMessage('介紹');
        const [success, fail] = await monitor.monitorMessage(responseType);
        console.log(`Passed: ${success}, Failed: ${fail}`);
        await monitor.cleanup();
        await browser.close();
        process.exit(0);

    } catch (error) {
        console.error('程式執行錯誤:', error);
        if (monitor) {
            await monitor.cleanup();
        }
        if (browser) {
            await browser.close();
        }
        process.exit(1);
    }

}

main().catch(console.error);