import pyautogui
import pytesseract
from PIL import ImageGrab
import time
import win32gui
import win32con
import win32api
import logging
import win32clipboard
import sys

class LineDesktopController:
    def __init__(self, window_title="develope club", debug_mode=True):
        self.window_title = window_title
        self.debug_mode = debug_mode
        logging.basicConfig(level=logging.DEBUG if debug_mode else logging.INFO)
        self.logger = logging.getLogger(__name__)
        # 設定 tesseract 執行檔路徑
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        # 設定 pyautogui 的安全參數
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.5
        
    def find_specific_window(self):
        """找到指定標題的視窗"""
        def callback(hwnd, target_hwnd):
            if win32gui.IsWindowVisible(hwnd):
                window_title = win32gui.GetWindowText(hwnd)
                if self.window_title in window_title:
                    target_hwnd[0] = hwnd
            return True
        
        target_hwnd = [None]
        win32gui.EnumWindows(callback, target_hwnd)
        
        if target_hwnd[0]:
            try:
                # 獲取視窗位置和大小
                rect = win32gui.GetWindowRect(target_hwnd[0])
                x, y, right, bottom = rect
                width = right - x
                height = bottom - y
                
                window_info = {
                    'hwnd': target_hwnd[0],
                    'rect': rect,
                    'x': x,
                    'y': y,
                    'width': width,
                    'height': height
                }
                
                self.logger.debug(f"找到目標視窗: {window_info}")
                return window_info
            
            except Exception as e:
                self.logger.error(f"獲取視窗信息時出錯: {str(e)}")
                return None
        
        self.logger.error(f"找不到標題包含 '{self.window_title}' 的視窗")
        return None

    def capture_window_area(self, window_info):
        """截取指定視窗的圖片"""
        try:
            # 確保視窗在前景
            hwnd = window_info['hwnd']
            win32gui.SetForegroundWindow(hwnd)
            time.sleep(0.5)  # 等待視窗切換
            
            # 截取整個視窗
            screenshot = ImageGrab.grab(bbox=(
                window_info['x'],
                window_info['y'],
                window_info['x'] + window_info['width'],
                window_info['y'] + window_info['height']
            ))
            
            if self.debug_mode:
                # 保存截圖用於調試
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                screenshot.save(f"window_capture_{timestamp}.png")
                self.logger.debug(f"截圖已保存: window_capture_{timestamp}.png")
            
            return screenshot
            
        except Exception as e:
            self.logger.error(f"截圖時發生錯誤: {str(e)}")
            return None

    def extract_text(self, image):
        """使用 OCR 從圖片中提取文字"""
        # 使用中文和英文語言包
        text = pytesseract.image_to_string(image, lang='chi_tra+eng')
        return text

    def focus_window(self, window_info):
        try:
            hwnd = window_info['hwnd']
            if win32gui.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
            time.sleep(0.5)
            return True
        except Exception as e:
            self.logger.error(f"視窗聚焦失敗: {str(e)}")
            return False

    def set_clipboard(self, text):
        """使用 win32clipboard 設置剪貼簿內容"""
        win32clipboard.OpenClipboard()
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
        win32clipboard.CloseClipboard()

    def simulate_paste_with_right_ctrl(self):
        """使用右側 Ctrl+V 貼上"""
        # 右側 Ctrl 的虛擬鍵碼是 0xA3
        RIGHT_CTRL = 0xA3
        V_KEY = 0x56
        
        try:
            # 按下右側 Ctrl
            win32api.keybd_event(RIGHT_CTRL, 0, 0, 0)
            time.sleep(0.1)
            
            # 按下 V
            win32api.keybd_event(V_KEY, 0, 0, 0)
            time.sleep(0.1)
            
            # 放開 V
            win32api.keybd_event(V_KEY, 0, win32con.KEYEVENTF_KEYUP, 0)
            time.sleep(0.1)
            
            # 放開右側 Ctrl
            win32api.keybd_event(RIGHT_CTRL, 0, win32con.KEYEVENTF_KEYUP, 0)
            time.sleep(0.1)
            
        except Exception as e:
            self.logger.error(f"模擬按鍵時發生錯誤: {str(e)}")

    def simulate_enter(self):
        """模擬按下 Enter 鍵"""
        win32api.keybd_event(0x0D, 0, 0, 0)  # Enter 按下
        time.sleep(0.1)
        win32api.keybd_event(0x0D, 0, win32con.KEYEVENTF_KEYUP, 0)  # Enter 放開
        time.sleep(0.1)

    def send_message(self, message):
        """發送訊息到 LINE 視窗"""
        try:
            # 找到並聚焦視窗
            window_info = self.find_specific_window()
            if not window_info or not self.focus_window(window_info):
                self.logger.error("無法找到或聚焦目標視窗")
                return False

            # 計算輸入框位置
            window_x = window_info['x']
            window_y = window_info['y']
            window_width = window_info['width']
            window_height = window_info['height']
            
            # 點擊輸入框
            input_x = window_x + (window_width // 2)
            input_y = window_y + window_height - 50
            pyautogui.moveTo(input_x, input_y)
            pyautogui.click()
            time.sleep(0.3)

            # 設置剪貼簿
            self.set_clipboard(message)
            time.sleep(0.3)
            
            # 使用右側 Ctrl+V 貼上
            self.simulate_paste_with_right_ctrl()
            time.sleep(0.3)
            
            # 發送訊息
            self.simulate_enter()

            self.logger.debug(f"已發送訊息: {message}")
            return True

        except Exception as e:
            self.logger.error(f"發送訊息時發生錯誤: {str(e)}")
            return False

    def get_latest_content(self):
        """獲取最新的視窗內容"""
        window_info = self.find_specific_window()
        if not window_info:
            return None
            
        screenshot = self.capture_window_area(window_info)
        text = self.extract_text(screenshot)
        return text

def main():

    # 檢查是否有傳入參數
    if len(sys.argv) > 1:
        responseType = sys.argv[1]  # 獲取第一個參數 'A'
    else:
        return

    # 創建控制器實例
    controller = LineDesktopController(window_title="develope club", debug_mode=False)
    
    # 測試視窗捕獲
    #print("開始捕獲視窗...")
    #text = controller.get_latest_content()
    #print(text)
    
    successCount = 0
    failCount = 0
    controller.send_message("aloha")
    time.sleep(8)
    text = controller.get_latest_content()
    if "Aloha" in text:
       successCount += 1 
    else:
       failCount += 1
   
    controller.send_message("hi")
    time.sleep(8)
    text = controller.get_latest_content()
    #print(text)
    if responseType == 'A':
        if "你 好" in text:
            successCount += 1
        else:
            failCount += 1
    elif responseType == 'B':
        if "developeclub 呈 回" in text:
            successCount += 1
        else:
            failCount += 1

    print(f"Passed: {successCount}, Failed: {failCount}")

if __name__ == "__main__":
    main()
