const { exit } = require('process');
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
            `${this.cookiesPath}messenger_cookies.json`,
            JSON.stringify(cookies, null, 2)
        );
        console.log(`${platform} cookies 已保存`);
    }

    // 載入 cookies
    async loadCookies(platform) {
        try {
            const cookiesString = await fs.readFile(
                `${this.cookiesPath}messenger_cookies.json`,
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

    // facebook 登入處理
    async facebookLogin(username, password) {
        try {
            await this.page.goto('https://www.messenger.com/login.php', {
                waitUntil: 'networkidle0'
            });

            // 檢查是否已經登入
            const isLoggedIn = await this.page.$('input[name="email"]') === null;
            if (isLoggedIn) {
                console.log('已經登入 facebook');
                return true;
            }

            // 輸入帳號密碼
            await this.page.type('input[name="email"]', username);
            await this.page.type('input[name="pass"]', password);
            await this.page.click('input[type="checkbox"][name="persistent"]');
            await this.page.click('button[type="submit"]');

            // 等待並點擊「繼續」按鈕
            await this.page.waitForSelector('._42ft._4jy0._5f0v._3-mv._9g9c._4jy4._517h._51sy');
            await this.page.click('._42ft._4jy0._5f0v._3-mv._9g9c._4jy4._517h._51sy');

            await this.page.waitForSelector('#approvals_code');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            // 提示用戶輸入簡訊驗證碼
            const code = await new Promise((resolve) => {  
                rl.question('請輸入簡訊驗證碼: ', (answer) => {
                    resolve(answer);
                    rl.close();
                });
            });

            await this.page.type('#approvals_code', code);
            await this.page.click('#checkpointSubmitButton');

            // 等待 PIN 碼輸入框出現
            await this.page.waitForSelector('#mw-numeric-code-input-prevent-composer-focus-steal');

            // 建立新的命令列介面
            const rl2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            // 提示用戶輸入 PIN 碼
            const pin = await new Promise((resolve) => {
                rl2.question('請輸入 6 位數 PIN 碼: ', (answer) => {
                    resolve(answer);
                    rl2.close();
                });
            });

            // 輸入 PIN 碼
            await this.page.type('#mw-numeric-code-input-prevent-composer-focus-steal', pin);

            await this.saveCookies('messenger');
            console.log("Facebook 登入成功");
            return true;

        } catch (error) {
            console.error('facebook 登入失敗:', error);
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

        // facebook 登入流程
        let facebookLoggedIn = await this.loadCookies('facebook');
        if (!facebookLoggedIn) {
            const fbUsername = await question('請輸入 facebook 帳號: ');
            const fbPassword = await question('請輸入 facebook 密碼: ');
            facebookLoggedIn = await this.facebookLogin(fbUsername, fbPassword);
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
        this.page.on('console', msg => {
            console.log('Browser console:', msg.text());
        });
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
            console.log('開始發送訊息流程...');
            
            // 0. 等待直到 pin input 元素消失
            let attempts = 0;
            const maxAttempts = 10;
            while (attempts < maxAttempts) {
                const pinInputExists = await this.page.evaluate(() => {
                    return !!document.querySelector('#mw-numeric-code-input-prevent-composer-focus-steal');
                });

                if (!pinInputExists) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;

                if (attempts === maxAttempts) {
                    throw new Error('等待 pin input 消失超時');
                }
            }

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
            await this.page.goto('https://www.messenger.com/t/110456171431210', {
                waitUntil: 'networkidle0'
            });

            const pinInputExists = await this.page.evaluate(() => {
                return !!document.querySelector('#mw-numeric-code-input-prevent-composer-focus-steal');
            });

            if (pinInputExists) {
                console.log('等待輸入 PIN 碼...');
                const pin = '771200';
                await this.page.type('#mw-numeric-code-input-prevent-composer-focus-steal', pin);
            }

            console.log('網址已開啟');
        } catch (error) {
            console.error('打開網址失敗:', error);
            throw error;
        }
    }

    async monitorMessage(responseType) {
        this.responseType = responseType;
        try {
            await fs.mkdir('./log', { recursive: true });

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

                                    // Alternative selector using class names
                                    const messages = node.querySelectorAll('.x78zum5.xdt5ytf.x1n2onr6[role="gridcell"]');
                                    console.log(messages);

                                    messages.forEach(message => {
                                        const text = message.innerText;
                                        if (text && text.trim()) {
                                            window.latestMessage = {
                                                text: text.trim(),
                                                timestamp: new Date().toISOString()
                                            };
                                            console.log('New message:', text.trim());
                                        }
                                    });
                                }
                            });
                        });
                    } catch (error) {
                        window.debugInfo.errors.push({
                            message: error.message,
                            timestamp: new Date().toISOString()
                        });
                        console.error('Observer error:', error);
                    }
                });

                // 尋找訊息容器
                //const messageContainer = document.querySelector('div[aria-label="Messages in conversation with Develope club"]');
                //if (messageContainer) {
                //    observer.observe(messageContainer, {
                //        childList: true,
                //        subtree: true,
                //        characterData: true
                //    });
                //    console.log('Started monitoring Messenger messages');
                //} else {
                //    console.error('Messenger message container not found');
                //    window.debugInfo.errors.push({
                //        message: 'Message container not found',
                //        timestamp: new Date().toISOString()
                //    });
                //}

                // Updated selector for message container
                const messageContainer = document.querySelector('div[role="main"]');
                if (messageContainer) {
                    observer.observe(messageContainer, {
                        childList: true,
                        subtree: true,
                        characterData: true
                    });
                    console.log('Started monitoring Messenger messages');
                } else {
                    console.error('Messenger message container not found');
                    window.debugInfo.errors.push({
                        message: 'Message container not found',
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // 4. 定期檢查訊息
            const targetStr = '阿羅哈您好';
            const targetStr2 = '阿羅哈愛爾麗';
            const targetStr3 = '阿羅哈Hi!';
            const waitStr = '你傳送了IGD';
            const botName = 'Develope club'; // Messenger 機器人的名稱
            while (this.isMonitoring) {
                const debugInfo = await this.page.evaluate(() => {
                    const info = window.debugInfo;
                    // 重置某些計數器
                    window.debugInfo.messagesProcessed = 0;
                    return info;
                });
                
                // 檢查是否有錯誤
                if (debugInfo.errors.length > 0) {
                    await this.logMessage(`監控出現錯誤: ${debugInfo.errors.join(', ')}`);
                }

                // 獲取最新訊息
                const msg = await this.page.evaluate(() => {
                    const message = window.latestMessage;
                    window.latestMessage = null;
                    return message;
                });

                //console.log('最新訊息:', msg);

                //if (this.resSuccess + this.resFail >= 2) {
                //    break;
                //}
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